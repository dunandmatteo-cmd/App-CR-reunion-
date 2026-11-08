"use strict";

// ---------------------------------------------------------------------------
// État + brouillon local, chiffré dans le coffre (voir vault.js)
// ---------------------------------------------------------------------------
const META_FIELDS = ["titre", "date", "lieu", "type", "president", "secretaire", "nbMembres", "participants", "consignes"];
const state = { transcript: "", anon: [], cr: null, exclusions: [], exclCounter: 0, ignore: [], detections: [] };
const $ = (id) => document.getElementById(id);
const AUTO_LOCK_MIN = 15;

function draftData() {
  const meta = Object.fromEntries(META_FIELDS.map((f) => [f, $(`m-${f}`).value]));
  return {
    meta, transcript: state.transcript, anon: state.anon, cr: state.cr, response: $("response").value,
    exclusions: state.exclusions, exclCounter: state.exclCounter, ignore: state.ignore,
  };
}

function saveDraft() {
  vault.save(draftData());
}

function applyDraft(d) {
  if (!d) return;
  for (const f of META_FIELDS) if (d.meta?.[f] !== undefined) $(`m-${f}`).value = d.meta[f];
  state.transcript = d.transcript || "";
  $("transcript").value = state.transcript;
  state.anon = Array.isArray(d.anon) ? d.anon : [];
  state.exclusions = Array.isArray(d.exclusions) ? d.exclusions : [];
  state.exclCounter = Number(d.exclCounter) || state.exclusions.length;
  state.ignore = Array.isArray(d.ignore) ? d.ignore : [];
  $("response").value = d.response || "";
  if (d.cr) showCR(d.cr);
}

function getMeta() {
  const m = Object.fromEntries(META_FIELDS.map((f) => [f, $(`m-${f}`).value.trim()]));
  if (m.date) m.date = m.date.split("-").reverse().join("/");
  return m;
}

// ---------------------------------------------------------------------------
// Import de la transcription (noScribe : .html, .txt, .vtt)
// ---------------------------------------------------------------------------
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, head").forEach((n) => n.remove());
  const blocks = [...doc.body.querySelectorAll("p, li, h1, h2, h3, h4, div")].filter((el) => !el.querySelector("p, li, div"));
  const lines = (blocks.length ? blocks : [doc.body]).map((el) => el.textContent.replace(/\s+/g, " ").trim());
  return lines.filter(Boolean).join("\n");
}

function vttToText(vtt) {
  return vtt
    .split(/\r?\n/)
    .filter((l) => l.trim() && !/^WEBVTT/.test(l) && !/-->/.test(l) && !/^\d+$/.test(l.trim()) && !/^NOTE\b/.test(l))
    .map((l) => l.replace(/<v\s+([^>]+)>/g, "$1 : ").replace(/<[^>]+>/g, "").trim())
    .join("\n");
}

async function importFile(file) {
  const raw = await file.text();
  const name = file.name.toLowerCase();
  let text;
  if (name.endsWith(".html") || name.endsWith(".htm") || /^\s*<(!doctype|html)/i.test(raw)) text = htmlToText(raw);
  else if (name.endsWith(".vtt") || /^WEBVTT/.test(raw)) text = vttToText(raw);
  else text = raw;
  setTranscript(text);
}

function setTranscript(text) {
  state.transcript = text;
  $("transcript").value = text;
  renderExclusions();
  updateInfos();
  saveDraft();
}

// ---------------------------------------------------------------------------
// Anonymisation
// ---------------------------------------------------------------------------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LETTER = "\\p{L}\\p{N}";

function nameRegex(name) {
  return new RegExp(`(?<![${LETTER}])${escapeRe(name.trim())}(?![${LETTER}])`, "giu");
}

function activeAnon() {
  return state.anon
    .filter((a) => a.nom.trim() && a.pseudo.trim())
    .sort((a, b) => b.nom.trim().length - a.nom.trim().length); // « Léa Martin » avant « Léa »
}

function anonymize(text) {
  let out = text;
  let count = 0;
  for (const a of activeAnon()) {
    out = out.replace(nameRegex(a.nom), () => {
      count++;
      return a.pseudo;
    });
  }
  return { text: out, count };
}

// Remet les vrais noms (uniquement ceux cochés « Rétablir ») dans le CR importé.
function restoreNames(value) {
  const rules = state.anon.filter((a) => a.restaurer && a.nom.trim() && a.pseudo.trim());
  const fix = (s) => rules.reduce((acc, a) => acc.split(a.pseudo).join(a.nom.trim()), s);
  const walk = (v) =>
    typeof v === "string" ? fix(v) : Array.isArray(v) ? v.map(walk) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v;
  return walk(value);
}

function nextPseudo() {
  const used = new Set(state.anon.map((a) => a.pseudo));
  for (let i = 0; i < 26 * 27; i++) {
    const letter = i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
    const p = `[Personne ${letter}]`;
    if (!used.has(p)) return p;
  }
  return `[Personne ${state.anon.length + 1}]`;
}

function renderAnon() {
  const tbody = $("anon-table").querySelector("tbody");
  tbody.replaceChildren();
  state.anon.forEach((a, i) => {
    const tr = document.createElement("tr");
    const nom = Object.assign(document.createElement("input"), { value: a.nom, placeholder: "Ex. Léa Martin" });
    nom.addEventListener("input", () => { a.nom = nom.value; updateInfos(); saveDraft(); });
    const pseudo = Object.assign(document.createElement("input"), { value: a.pseudo });
    pseudo.addEventListener("input", () => { a.pseudo = pseudo.value; updateInfos(); saveDraft(); });
    const chk = Object.assign(document.createElement("input"), { type: "checkbox", checked: Boolean(a.restaurer) });
    chk.addEventListener("change", () => { a.restaurer = chk.checked; saveDraft(); });
    const del = Object.assign(document.createElement("button"), { className: "icon-btn danger", textContent: "✕", title: "Supprimer" });
    del.addEventListener("click", () => { state.anon.splice(i, 1); renderAnon(); updateInfos(); saveDraft(); });
    for (const el of [nom, pseudo, chk, del]) {
      const td = document.createElement("td");
      if (el === chk) td.className = "center";
      td.append(el);
      tr.append(td);
    }
    tbody.append(tr);
  });
}

function addAnon(nom = "", restaurer = false, pseudo = null) {
  if (nom && state.anon.some((a) => a.nom.trim().toLowerCase() === nom.trim().toLowerCase())) return;
  state.anon.push({ nom, pseudo: pseudo || nextPseudo(), restaurer });
  renderAnon();
  updateInfos();
  saveDraft();
}

function addParticipants() {
  const lines = $("m-participants").value.split("\n").map((l) => l.split(/\s[–-]\s|,|\(/)[0].trim()).filter(Boolean);
  if (!lines.length) return alert("Aucun participant saisi à l'étape 1.");
  for (const nom of lines) {
    addAnon(nom, true);
    const prenom = nom.split(/\s+/)[0];
    if (prenom && prenom !== nom) addAnon(prenom, true);
  }
}

// ---------------------------------------------------------------------------
// Infos et texte envoyé
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Passages retirés de l'envoi
// ---------------------------------------------------------------------------
const exclPlaceholder = (n) => `[Passage retiré n°${n} : à rédiger manuellement]`;
// Repère laissé dans la transcription à la place du passage retiré. Le texte d'origine
// est conservé à part (dans le coffre chiffré) : modifier le reste de la transcription
// ne peut donc pas faire réapparaître le passage dans l'envoi.
const exclMarker = (n) => `⟦Passage retiré n°${n}⟧`;

function applyExclusions(text) {
  let out = text;
  let applied = 0;
  let words = 0;
  const missing = [];
  for (const ex of state.exclusions) {
    if (out.includes(exclMarker(ex.n))) {
      applied++;
      words += ex.texte.trim().split(/\s+/).length;
      out = out.split(exclMarker(ex.n)).join(exclPlaceholder(ex.n));
    } else {
      missing.push(ex.n);
    }
  }
  // Repère orphelin (copié-collé, ancien brouillon) : jamais envoyé tel quel.
  out = out.replace(/⟦Passage retiré n°(\d+)⟧/g, (_, n) => exclPlaceholder(n));
  return { text: out, applied, words, missing };
}

function excludeSelection() {
  const t = $("transcript");
  const { selectionStart: a, selectionEnd: b } = t;
  const sel = t.value.slice(a, b);
  if (sel.trim().length < 3) {
    $("excl-info").textContent = "Sélectionne d'abord, dans la transcription ci-dessus, le passage à retirer.";
    return;
  }
  if (/⟦Passage retiré n°\d+⟧/.test(sel)) {
    $("excl-info").textContent = "La sélection contient déjà un passage retiré : sélectionne un autre passage.";
    return;
  }
  state.exclCounter += 1;
  const n = state.exclCounter;
  state.exclusions.push({ n, texte: sel });
  state.transcript = t.value.slice(0, a) + exclMarker(n) + t.value.slice(b);
  t.value = state.transcript;
  $("excl-info").textContent = `Passage n°${n} retiré : il ne partira pas.`;
  renderExclusions();
  updateInfos();
  saveDraft();
}

function restoreExclusion(ex) {
  const marker = exclMarker(ex.n);
  if (state.transcript.includes(marker)) {
    state.transcript = state.transcript.split(marker).join(ex.texte);
    $("transcript").value = state.transcript;
  }
  state.exclusions = state.exclusions.filter((x) => x !== ex);
  renderExclusions();
  updateInfos();
  saveDraft();
}

function renderExclusions() {
  const box = $("excl-list");
  box.replaceChildren();
  const missing = new Set(applyExclusions(state.transcript).missing);
  for (const ex of state.exclusions) {
    const preview = ex.texte.replace(/\s+/g, " ").trim();
    const gone = missing.has(ex.n);
    box.append(el("div", { class: `excl-item${gone ? " missing" : ""}` }, [
      el("span", { class: "chip", text: `n°${ex.n}` }),
      el("span", { class: "excl-text", text: preview.length > 140 ? preview.slice(0, 140) + "…" : preview }),
      gone ? el("span", { class: "chip", text: "repère effacé de la transcription" }) : null,
      el("button", {
        class: "icon-btn", type: "button", text: gone ? "Oublier" : "Remettre dans la transcription",
        onclick: () => restoreExclusion(ex),
      }),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Texte envoyé : retraits → pseudonymisation → détection des restes
// ---------------------------------------------------------------------------
function anonymizeMeta(meta) {
  const out = { ...meta };
  let count = 0;
  for (const k of ["president", "secretaire", "participants", "consignes", "titre", "lieu"]) {
    const r = anonymize(out[k] || "");
    out[k] = r.text;
    count += r.count;
  }
  return { meta: out, count };
}

function buildOutgoing() {
  const ex = applyExclusions(state.transcript);
  const an = anonymize(ex.text);
  const mt = anonymizeMeta(getMeta());
  const scanText = [an.text, mt.meta.president, mt.meta.secretaire, mt.meta.participants, mt.meta.consignes, mt.meta.titre, mt.meta.lieu].join("\n");
  return {
    prompt: buildPrompt(an.text, mt.meta),
    replacements: an.count + mt.count,
    exclusions: ex,
    detections: detectSensitive(scanText, state.ignore),
    words: an.text.trim() ? an.text.trim().split(/\s+/).length : 0,
  };
}

let infoTimer = null;
function updateInfos() {
  clearTimeout(infoTimer);
  infoTimer = setTimeout(updateInfosNow, 250);
}

function updateInfosNow() {
  clearTimeout(infoTimer);
  const words = state.transcript.trim() ? state.transcript.trim().split(/\s+/).length : 0;
  $("transcript-info").textContent = words ? `${words.toLocaleString("fr-FR")} mots` : "";
  const out = buildOutgoing();
  state.detections = out.detections;
  $("anon-info").textContent = activeAnon().length ? `${out.replacements} remplacement(s) effectué(s) dans la transcription et les informations.` : "";
  $("prompt-preview").value = out.prompt;
  renderDetections(out.detections);
  renderReport(out, words);
}

// ---------------------------------------------------------------------------
// Détections automatiques (étape 3)
// ---------------------------------------------------------------------------
function pseudoForType(type) {
  const base = DETECT_TYPES[type].pseudo.slice(1, -1);
  const used = new Set(state.anon.map((a) => a.pseudo));
  for (let i = 1; i < 1000; i++) {
    const p = i === 1 ? `[${base}]` : `[${base} ${i}]`;
    if (!used.has(p)) return p;
  }
  return `[${base}]`;
}

function renderDetections(list) {
  const box = $("detect-list");
  const badge = $("detect-count");
  box.replaceChildren();
  if (!state.transcript.trim()) {
    badge.textContent = "En attente de la transcription";
    badge.className = "chip";
    return;
  }
  badge.textContent = list.length ? `${list.length} élément(s) à examiner` : "Rien de détecté";
  badge.className = `chip ${list.length ? "warn" : "ok"}`;
  for (const d of list) {
    const isName = d.type === "nom";
    box.append(el("div", { class: "detect-item" }, [
      el("span", { class: "chip type", text: DETECT_TYPES[d.type].label }),
      el("span", { class: "detect-value", text: d.value }),
      el("span", { class: "detect-n", text: `×${d.count}` }),
      el("span", { class: "detect-actions" }, [
        el("button", {
          class: "icon-btn", type: "button", text: "Anonymiser",
          onclick: () => addAnon(d.value, false, isName ? null : pseudoForType(d.type)),
        }),
        el("button", {
          class: "icon-btn", type: "button", text: "Ignorer",
          onclick: () => {
            state.ignore.push(d.value);
            updateInfos();
            saveDraft();
          },
        }),
      ]),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Rapport avant envoi (étape 4)
// ---------------------------------------------------------------------------
function renderReport(out, words) {
  const byType = {};
  for (const d of out.detections) byType[d.type] = (byType[d.type] || 0) + 1;
  const alerts = out.detections.length;
  const noAnon = !activeAnon().length;
  const rows = [
    ["Mots envoyés", words ? out.words.toLocaleString("fr-FR") : "—", ""],
    ["Remplacements (noms, numéros…)", String(out.replacements), noAnon ? "warn" : "ok"],
    ["Passages retirés", out.exclusions.applied ? `${out.exclusions.applied} (${out.exclusions.words} mots)` : "0", ""],
    [
      "Données identifiantes restantes",
      alerts ? Object.entries(byType).map(([t, n]) => `${n} × ${DETECT_TYPES[t].label.toLowerCase()}`).join(", ") : "aucune détectée",
      alerts ? "warn" : "ok",
    ],
  ];
  $("report-body").replaceChildren(...rows.map(([k, v, cls]) => el("tr", {}, [el("th", { text: k }), el("td", { class: cls, text: v })])));

  const needAck = Boolean(words) && (alerts > 0 || noAnon);
  $("report-ack-row").hidden = !needAck;
  if (!needAck) $("report-ack").checked = false;
  $("report-ack-label").textContent = noAnon
    ? "Aucun nom n'est anonymisé : j'accepte d'envoyer la transcription telle quelle."
    : "J'ai examiné les alertes restantes et j'accepte d'envoyer ce texte.";
  $("btn-copy-prompt").disabled = !(Boolean(words) && (!needAck || $("report-ack").checked));
  $("prompt-info").textContent = words ? `≈ ${Math.round(out.prompt.length / 1000)} k caractères` : "Importe d'abord la transcription (étape 2).";
}

async function copyPrompt() {
  if (state.transcript.trim().length < 20) return alert("Importe ou colle d'abord la transcription (étape 2).");
  const { prompt } = buildOutgoing();
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    const t = $("prompt-preview");
    t.closest("details").open = true;
    t.value = prompt;
    t.select();
    document.execCommand("copy");
  }
  $("prompt-info").textContent = "Copié ✔ : colle-le dans Claude.ai";
}

// ---------------------------------------------------------------------------
// Import de la réponse de Claude
// ---------------------------------------------------------------------------
function importResponse() {
  const text = $("response").value;
  if (!text.trim()) return alert("Colle d'abord la réponse de Claude.");
  if (state.cr && !confirm("Remplacer le compte rendu actuel (et tes corrections) par cette réponse ?")) return;
  try {
    const cr = restoreNames(normalizeCR(extractJson(text)));
    showCR(cr);
    saveDraft();
    $("step-cr").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    alert(`Import impossible : ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// CR éditable
// ---------------------------------------------------------------------------
const FIELDS = [
  ["titre", "Titre"], ["date", "Date"], ["lieu", "Lieu"], ["type_reunion", "Type"],
  ["president_seance", "Président(e) de séance"], ["secretaire_seance", "Secrétaire de séance"], ["quorum", "Quorum"],
];
const TABLES = {
  participants: { title: "Présents", cols: [["nom", "Nom"], ["qualite", "Qualité"]] },
  points: { title: "Points abordés", cols: [["sujet", "Sujet"], ["resume", "Résumé", "area"]] },
  deliberations: {
    title: "Délibérations et votes",
    cols: [
      ["objet", "Objet", "area"], ["decision", "Décision", "area"],
      ["resultat", "Résultat", ["Adoptée", "Rejetée", "Reportée", "Non précisé"]],
      ["pour", "Pour", "short"], ["contre", "Contre", "short"], ["abstention", "Abst.", "short"], ["commentaire", "Commentaire", "area"],
    ],
  },
  actions: {
    title: "Actions",
    cols: [["action", "Action", "area"], ["responsable", "Responsable"], ["delai", "Délai"], ["priorite", "Priorité", ["Haute", "Moyenne", "Basse", "Non précisée"]], ["sujet", "Sujet", "area"]],
  },
  points_sensibles: { title: "⚠ Points sensibles (à arbitrer avant diffusion)", cols: [["passage", "Passage"], ["raison", "Raison", "area"]] },
  points_a_verifier: { title: "Points à vérifier (transcription douteuse)", cols: [["passage", "Passage"], ["raison", "Raison", "area"]] },
};
const LISTS = { absents_excuses: "Absents / excusés", invites: "Invités", ordre_du_jour: "Ordre du jour", points_ouverts: "Points en suspens" };

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) e.append(c);
  return e;
}

function autoGrow(t) {
  t.style.height = "auto";
  t.style.height = `${t.scrollHeight + 2}px`;
}

const isTbd = (v) => /à définir|^\s*\?\s*$/i.test(v) || v.trim() === "";

function editor(value, onInput, type, flag = false) {
  let input;
  if (Array.isArray(type)) {
    input = el("select", {}, type.map((o) => el("option", { text: o })));
    if (value && !type.includes(value)) input.append(el("option", { text: value }));
    input.value = value || type[type.length - 1];
  } else if (type === "area") {
    input = el("textarea", { rows: 2 });
    input.value = value ?? "";
    requestAnimationFrame(() => autoGrow(input));
  } else {
    input = el("input", type === "short" ? { class: "short" } : {});
    input.value = value ?? "";
  }
  const mark = () => flag && input.classList.toggle("tbd", isTbd(input.value));
  mark();
  input.addEventListener("input", () => {
    onInput(input.value);
    if (input.tagName === "TEXTAREA") autoGrow(input);
    mark();
    saveDraft();
  });
  return input;
}

function renderCR() {
  const root = $("cr");
  root.replaceChildren();
  const cr = state.cr;

  const head = el("div", { class: "grid" });
  for (const [k, label] of FIELDS) head.append(el("label", { text: label }, editor(cr[k], (v) => (cr[k] = v))));
  root.append(head);

  root.append(renderTable("points_sensibles"));
  root.append(renderTable("participants"));
  root.append(renderList("absents_excuses"));
  root.append(renderList("invites"));
  root.append(renderList("ordre_du_jour"));
  root.append(renderTable("points"));
  root.append(renderTable("deliberations"));
  root.append(renderTable("actions"));
  root.append(renderList("points_ouverts"));
  root.append(renderTable("points_a_verifier"));
  root.append(el("label", { text: "Prochaine réunion" }, editor(cr.prochaine_reunion, (v) => (cr.prochaine_reunion = v))));

  const sensibles = cr.points_sensibles.length;
  $("cr-warn").textContent = sensibles
    ? `Brouillon : ${sensibles} point(s) sensible(s) à arbitrer avant diffusion (voir en haut). Vérifie aussi les votes, décisions, responsables et délais.`
    : "Brouillon : vérifie les votes, décisions, responsables et délais avant d'envoyer au secrétaire.";
}

const FLAGGED = { actions: ["responsable", "delai"], deliberations: ["pour", "contre", "abstention"] };

function renderTable(key) {
  const { title, cols } = TABLES[key];
  const rows = (state.cr[key] ||= []);
  const tbody = el("tbody");
  rows.forEach((row, i) => {
    const tr = el("tr");
    for (const [field, , type] of cols) {
      tr.append(el("td", {}, editor(row[field], (v) => (row[field] = v), type, FLAGGED[key]?.includes(field))));
    }
    tr.append(el("td", {}, el("button", {
      class: "icon-btn danger", title: "Supprimer", text: "✕",
      onclick: () => { rows.splice(i, 1); saveDraft(); renderCR(); },
    })));
    tbody.append(tr);
  });
  const table = el("table", {}, [el("thead", {}, el("tr", {}, [...cols.map(([, l]) => el("th", { text: l })), el("th")])), tbody]);
  const add = el("button", {
    class: "icon-btn", text: "+ Ajouter une ligne",
    onclick: () => {
      rows.push(Object.fromEntries(cols.map(([f, , t]) => [f, Array.isArray(t) ? t[t.length - 1] : key === "actions" && (f === "responsable" || f === "delai") ? "À définir" : ""])));
      saveDraft();
      renderCR();
    },
  });
  return el("div", { class: `cr-section${key === "points_sensibles" && rows.length ? " sensitive" : ""}` }, [
    el("h3", { text: `${title} (${rows.length})` }), el("div", { class: "table-wrap" }, table), add,
  ]);
}

function renderList(key) {
  const items = (state.cr[key] ||= []);
  const box = el("div", { class: "cr-section" }, el("h3", { text: `${LISTS[key]} (${items.length})` }));
  items.forEach((item, i) => {
    box.append(el("div", { class: "list-item" }, [
      editor(item, (v) => (items[i] = v), "area"),
      el("button", { class: "icon-btn danger", text: "✕", onclick: () => { items.splice(i, 1); saveDraft(); renderCR(); } }),
    ]));
  });
  box.append(el("button", { class: "icon-btn", text: "+ Ajouter", onclick: () => { items.push(""); saveDraft(); renderCR(); } }));
  return box;
}

function showCR(cr) {
  state.cr = normalizeCR(cr);
  $("step-cr").hidden = false;
  renderCR();
}

// ---------------------------------------------------------------------------
// Exports et réinitialisation
// ---------------------------------------------------------------------------
async function guardedExport(fn) {
  if (state.cr.points_sensibles.length && !confirm(`${state.cr.points_sensibles.length} point(s) sensible(s) sont signalés. As-tu vérifié que le CR peut être diffusé tel quel ?`)) return;
  try {
    await fn();
  } catch (err) {
    alert(`Échec de l'export : ${err.message}`);
  }
}

function resetAll() {
  if (!confirm("Effacer la réunion en cours (transcription, réponse et CR) ? La liste des noms à anonymiser est conservée.")) return;
  for (const f of ["titre", "lieu", "consignes"]) $(`m-${f}`).value = "";
  $("response").value = "";
  state.exclusions = [];
  state.exclCounter = 0;
  state.transcript = "";
  state.cr = null;
  saveDraft(); // garde : noms à anonymiser, participants, président, secrétaire
  vault.flush().then(() => location.reload());
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Écran de déverrouillage
// ---------------------------------------------------------------------------
function showLock(mode, message = "") {
  const creating = mode === "create";
  $("lock").hidden = false;
  $("app").hidden = true;
  $("lock-title").textContent = creating ? "Créer le mot de passe du coffre" : "Coffre verrouillé";
  $("lock-text").textContent = creating
    ? "Tes brouillons (transcription, vrais noms, CR) seront chiffrés sur ce Mac avec ce mot de passe. Il n'est enregistré nulle part : s'il est perdu, les brouillons sont irrécupérables."
    : "Saisis ton mot de passe pour déchiffrer le brouillon.";
  $("lock-confirm-row").hidden = !creating;
  $("lock-forgot").hidden = creating;
  $("lock-submit").textContent = creating ? "Créer et ouvrir" : "Déverrouiller";
  $("lock-error").textContent = message;
  $("lock-pass").value = "";
  $("lock-pass2").value = "";
  $("lock-pass").focus();
  $("lock-form").dataset.mode = mode;
}

async function submitLock(e) {
  e.preventDefault();
  const mode = $("lock-form").dataset.mode;
  const pass = $("lock-pass").value;
  $("lock-error").textContent = "";
  try {
    let data;
    if (mode === "create") {
      if (pass.length < 10) throw new Error("10 caractères minimum (une phrase courte est idéale).");
      if (pass !== $("lock-pass2").value) throw new Error("Les deux mots de passe sont différents.");
      $("lock-submit").disabled = true;
      data = await vault.create(pass);
    } else {
      $("lock-submit").disabled = true;
      data = await vault.unlock(pass);
    }
    $("lock").hidden = true;
    $("app").hidden = false;
    startApp(data);
  } catch (err) {
    $("lock-error").textContent = err.message;
  } finally {
    $("lock-submit").disabled = false;
  }
}

function forgotPassword() {
  if (!confirm("Sans le mot de passe, le brouillon chiffré est irrécupérable. Tout effacer et recommencer ?")) return;
  vault.destroy();
  showLock("create");
}

async function lockNow() {
  await vault.flush();
  vault.lock();
  location.reload(); // vide la mémoire de la page
}

function setupAutoLock() {
  let t;
  const arm = () => {
    clearTimeout(t);
    t = setTimeout(lockNow, AUTO_LOCK_MIN * 60 * 1000);
  };
  for (const ev of ["pointerdown", "keydown", "scroll"]) window.addEventListener(ev, arm, { passive: true });
  arm();
}

async function changePassword() {
  const p1 = prompt("Nouveau mot de passe (10 caractères minimum) :");
  if (p1 === null) return;
  if (p1.length < 10) return alert("10 caractères minimum.");
  const p2 = prompt("Confirme le nouveau mot de passe :");
  if (p1 !== p2) return alert("Les deux mots de passe sont différents.");
  await vault.flush();
  await vault.changePassword(p1, draftData());
  alert("Mot de passe modifié.");
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
let started = false;
function startApp(data) {
  if (started) return;
  started = true;
  $("m-date").value = new Date().toISOString().slice(0, 10);
  applyDraft(data);
  renderAnon();
  renderExclusions();
  updateInfosNow();
  setupAutoLock();
  vault.onStatus = (err) => {
    $("save-error").hidden = !err;
    if (err) $("save-error").textContent = `⚠ Brouillon NON sauvegardé (${err.message}). Ne verrouille pas et ne ferme pas la page : exporte d'abord le Word, puis signale le problème.`;
  };

  for (const f of META_FIELDS) $(`m-${f}`).addEventListener("input", () => { updateInfos(); saveDraft(); });
  $("file").addEventListener("change", (e) => e.target.files?.[0] && importFile(e.target.files[0]));
  $("transcript").addEventListener("input", () => { state.transcript = $("transcript").value; renderExclusions(); updateInfos(); saveDraft(); });
  $("btn-anon-add").addEventListener("click", () => addAnon());
  $("btn-exclude").addEventListener("click", excludeSelection);
  $("report-ack").addEventListener("change", () => updateInfosNow());
  $("btn-ignore-reset").addEventListener("click", () => { state.ignore = []; updateInfos(); saveDraft(); });
  $("btn-anon-participants").addEventListener("click", addParticipants);
  $("btn-copy-prompt").addEventListener("click", copyPrompt);
  $("response").addEventListener("input", saveDraft);
  $("btn-import").addEventListener("click", importResponse);
  $("btn-word").addEventListener("click", () => guardedExport(() => exportWord(state.cr, { inclureVerifs: $("opt-verifs").checked })));
  $("btn-excel").addEventListener("click", () => guardedExport(() => exportExcel(state.cr)));
  $("btn-reset").addEventListener("click", resetAll);
  $("btn-lock").addEventListener("click", lockNow);
  $("btn-password").addEventListener("click", changePassword);
  window.addEventListener("pagehide", () => vault.flush());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && vault.flush());
}

function init() {
  $("lock-form").addEventListener("submit", submitLock);
  $("lock-forgot").addEventListener("click", forgotPassword);
  if (!vault.supported()) {
    $("lock").hidden = false;
    $("app").hidden = true;
    $("lock-title").textContent = "Navigateur non compatible";
    $("lock-text").textContent = "Ce navigateur ne permet pas le chiffrement depuis un fichier local. Ouvre index.html avec Chrome, Firefox ou Safari récent.";
    $("lock-form").hidden = true;
    return;
  }
  showLock(vault.exists() ? "unlock" : "create");
}

init();
