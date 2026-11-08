"use strict";
// Logique pure (sans affichage) : utilisée par l'app et par les tests automatiques (tests/).
// Ordre de traitement du texte envoyé à Claude :
//   corrections (à l'import) → intervenants → passages retirés → pseudonymisation → détection des restes

// ---------------------------------------------------------------------------
// Correspondance tolérante aux accents, à la casse, aux tirets et apostrophes
// ---------------------------------------------------------------------------
const ACCENT_CLASSES = {
  a: "aàâäáãå", e: "eéèêë", i: "iîïíì", o: "oôöóòõ", u: "uùûüú", c: "cç", y: "yÿý", n: "nñ",
};

const stripAccents = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LETTER = "\\p{L}\\p{N}";

function loosePattern(text) {
  let out = "";
  for (const ch of stripAccents(text.trim()).toLowerCase()) {
    if (ACCENT_CLASSES[ch]) out += `[${ACCENT_CLASSES[ch]}]`;
    else if (ch === "-" || /\s/.test(ch)) out += "[-\\s]+"; // « Jean-Pierre » = « Jean Pierre »
    else if (ch === "'" || ch === "’") out += "['’]";
    else out += escapeRe(ch);
  }
  return out;
}

function looseRegex(text) {
  return new RegExp(`(?<![${LETTER}])${loosePattern(text)}(?![${LETTER}])`, "giu");
}

const sameName = (a, b) => stripAccents(a.trim()).toLowerCase() === stripAccents(b.trim()).toLowerCase();

// ---------------------------------------------------------------------------
// Pseudonymisation
// ---------------------------------------------------------------------------
function activeRules(rules) {
  return rules
    .filter((r) => r.nom && r.nom.trim() && r.pseudo && r.pseudo.trim())
    .sort((a, b) => b.nom.trim().length - a.nom.trim().length); // « Léa Martin » avant « Léa »
}

function anonymizeText(text, rules) {
  let out = text;
  let count = 0;
  for (const r of activeRules(rules)) {
    out = out.replace(looseRegex(r.nom), () => {
      count++;
      return r.pseudo;
    });
  }
  return { text: out, count };
}

// Remet les vrais noms (règles cochées « Rétablir ») dans un objet quelconque (le CR importé).
function restoreNamesIn(value, rules) {
  const keep = rules.filter((r) => r.restaurer && r.nom && r.nom.trim() && r.pseudo && r.pseudo.trim());
  const fix = (s) => keep.reduce((acc, r) => acc.split(r.pseudo).join(r.nom.trim()), s);
  const walk = (v) =>
    typeof v === "string" ? fix(v)
      : Array.isArray(v) ? v.map(walk)
        : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
          : v;
  return walk(value);
}

function nextPseudo(rules) {
  const used = new Set(rules.map((r) => r.pseudo));
  for (let i = 0; i < 26 * 27; i++) {
    const letter = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    const p = `[Personne ${letter}]`;
    if (!used.has(p)) return p;
  }
  return `[Personne ${rules.length + 1}]`;
}

// ---------------------------------------------------------------------------
// Passages retirés
// ---------------------------------------------------------------------------
const exclMarker = (n) => `⟦Passage retiré n°${n}⟧`;
const exclPlaceholder = (n) => `[Passage retiré n°${n} : à rédiger manuellement]`;

function applyExclusionsTo(text, exclusions) {
  let out = text;
  let applied = 0;
  let words = 0;
  const missing = [];
  for (const ex of exclusions) {
    if (out.includes(exclMarker(ex.n))) {
      applied++;
      words += wordCount(ex.texte);
      out = out.split(exclMarker(ex.n)).join(exclPlaceholder(ex.n));
    } else {
      missing.push(ex.n);
    }
  }
  // Repère orphelin (copié-collé, ancien brouillon) : jamais envoyé tel quel.
  out = out.replace(/⟦Passage retiré n°(\d+)⟧/g, (_, n) => exclPlaceholder(n));
  return { text: out, applied, words, missing };
}

// ---------------------------------------------------------------------------
// Dictionnaire de corrections (erreurs de transcription récurrentes)
// ---------------------------------------------------------------------------
function applyCorrectionsTo(text, corrections) {
  let out = text;
  let count = 0;
  const list = corrections
    .filter((c) => c.de && c.de.trim() && c.vers !== undefined)
    .sort((a, b) => b.de.trim().length - a.de.trim().length);
  for (const c of list) {
    out = out.replace(looseRegex(c.de), () => {
      count++;
      return c.vers;
    });
  }
  return { text: out, count };
}

// ---------------------------------------------------------------------------
// Intervenants (étiquettes de noScribe et des outils courants)
// ---------------------------------------------------------------------------
const SPEAKER_LINE = /^(\[[^\]\n]*\]\s*)?(S\d{1,3}|SPEAKER[_ ]\d{1,3}|Speaker \d{1,3}|Locuteur \d{1,3}|Intervenant \d{1,3})\s*:\s*(.*)$/gim;

function detectSpeakers(text) {
  const map = new Map();
  for (const m of text.matchAll(SPEAKER_LINE)) {
    const label = m[2];
    const key = label.toUpperCase();
    const cur = map.get(key) || { label, count: 0, words: 0, sample: "" };
    cur.count++;
    cur.words += wordCount(m[3]);
    if (!cur.sample && wordCount(m[3]) >= 4) cur.sample = m[3].trim().slice(0, 140);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

function applySpeakersTo(text, speakerMap) {
  const named = Object.fromEntries(Object.entries(speakerMap).filter(([, v]) => v && v.trim()).map(([k, v]) => [k.toUpperCase(), v.trim()]));
  if (!Object.keys(named).length) return text;
  return text.replace(SPEAKER_LINE, (whole, stamp = "", label, rest) => {
    const name = named[label.toUpperCase()];
    return name ? `${stamp || ""}${name} : ${rest}` : whole;
  });
}

// ---------------------------------------------------------------------------
// Imports de fichiers texte
// ---------------------------------------------------------------------------
function vttToText(vtt) {
  return vtt
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^WEBVTT/.test(l) && !/-->/.test(l) && !/^\d+$/.test(l.trim()) && !/^NOTE\b/.test(l))
    .map((l) => l.replace(/<v\s+([^>]+)>/g, "$1 : ").replace(/<[^>]+>/g, "").trim())
    .join("\n");
}

const wordCount = (s) => (s && s.trim() ? s.trim().split(/\s+/).length : 0);

if (typeof module !== "undefined") {
  module.exports = {
    stripAccents, looseRegex, sameName, anonymizeText, restoreNamesIn, nextPseudo,
    exclMarker, exclPlaceholder, applyExclusionsTo, applyCorrectionsTo,
    detectSpeakers, applySpeakersTo, vttToText, wordCount,
  };
}
