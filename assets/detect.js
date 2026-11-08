"use strict";
// Détection des données identifiantes restantes dans le texte qui va partir.
// Heuristiques volontairement larges : mieux vaut une fausse alerte (bouton
// « Ignorer ») qu'un nom ou un numéro qui part en clair.

const DETECT_TYPES = {
  nom: { label: "Nom propre probable", pseudo: null },
  email: { label: "E-mail", pseudo: "[E-mail]" },
  telephone: { label: "Téléphone", pseudo: "[Téléphone]" },
  adresse: { label: "Adresse", pseudo: "[Adresse]" },
  cp_ville: { label: "Code postal + ville", pseudo: "[Commune]" },
  naissance: { label: "Date de naissance probable", pseudo: "[Date]" },
  iban: { label: "IBAN", pseudo: "[IBAN]" },
  numero: { label: "Numéro (licence, dossier…)", pseudo: "[Numéro]" },
};

// Mots qui prennent souvent une majuscule en milieu de phrase sans désigner une personne.
const COMMON_CAPS = new Set(
  (
    "Lundi Mardi Mercredi Jeudi Vendredi Samedi Dimanche " +
    "Janvier Février Fevrier Mars Avril Mai Juin Juillet Août Aout Septembre Octobre Novembre Décembre Decembre " +
    "Président Présidente Trésorier Trésorière Secrétaire Vice-président Vice-présidente Bureau Comité Conseil " +
    "Assemblée Générale Club Association Fédération Ligue Région Département Mairie Ville Commune Préfecture " +
    "Seynod Annecy Haute-Savoie Savoie France Auvergne-Rhône-Alpes Rhône-Alpes Piscine Euro Euros " +
    "Monsieur Madame Mademoiselle Messieurs Mesdames Mme Mmes Mlle Mr Merci Bonjour Bonsoir Oui Non Ok Voilà Alors Donc " +
    "Noël Pâques Toussaint Covid Internet Facebook Instagram WhatsApp Excel Word Google Teams Zoom Claude"
  ).split(/\s+/).map((w) => w.toLowerCase())
);

const MONTHS = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";

// Masque le contenu entre crochets ([Personne A], [00:01:02], [Téléphone]…) sans décaler les positions.
function maskBrackets(text) {
  return text.replace(/\[[^\]\n]{0,80}\]/g, (m) => " ".repeat(m.length));
}

function isSentenceStart(text, index) {
  let i = index - 1;
  while (i >= 0 && /[\s"«“'(—–-]/.test(text[i])) {
    if (text[i] === "\n") return true;
    i--;
  }
  if (i < 0) return true;
  return /[.!?…:;]/.test(text[i]) || /\]/.test(text[i]);
}

function detectSensitive(text, ignoreList = []) {
  const ignore = new Set(ignoreList.map((v) => v.trim().toLowerCase()));
  const found = new Map(); // clé type|valeur -> {type, value, count}
  const taken = []; // plages déjà attribuées (évite un double signalement)
  const masked = maskBrackets(text);

  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  const add = (type, value, start, end) => {
    const v = value.trim().replace(/[\s,;.]+$/, "");
    if (!v || ignore.has(v.toLowerCase()) || overlaps(start, end)) return;
    taken.push([start, end]);
    const key = `${type}|${v.toLowerCase()}`;
    const cur = found.get(key);
    if (cur) cur.count++;
    else found.set(key, { type, value: v, count: 1 });
  };
  const scan = (type, re, pick = (m) => m[0], accept = () => true) => {
    for (const m of masked.matchAll(re)) {
      if (!accept(m)) continue;
      const value = pick(m);
      const start = m.index + m[0].indexOf(value);
      add(type, text.slice(start, start + value.length), start, start + value.length);
    }
  };

  const year = new Date().getFullYear();

  // Ordre important : du plus spécifique au plus général.
  scan("email", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g);
  scan("iban", /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g);
  scan("telephone", /(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g);
  scan(
    "naissance",
    new RegExp(`\\bn[ée]e?s?\\s+(?:le\\s+)?(?:\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\s+\\d{4}|\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|en\\s+\\d{4})`, "gi")
  );
  scan(
    "naissance",
    /\b(?:0?[1-9]|[12]\d|3[01])[/.-](?:0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})\b/g,
    (m) => m[0],
    (m) => Number(m[1]) <= year - 3 // une date ancienne ressemble plus à une naissance qu'à une échéance
  );
  scan(
    "adresse",
    /\b\d{1,4}(?:\s?(?:bis|ter))?,?\s+(?:rue|avenue|av\.|boulevard|bd|chemin|impasse|route|allée|allee|place|quai|square|lotissement|résidence|residence|montée|montee)\b[^\n,.;]{2,40}/gi
  );
  scan("cp_ville", /\b(?:0[1-9]|[1-8]\d|9[0-8])\d{3}\s+[A-ZÀ-Ý][\wÀ-ÿ'-]+(?:[\s-][A-ZÀ-Ý][\wÀ-ÿ'-]+){0,2}/g);
  scan("numero", /\b(?:licence|license|dossier|adhérent|adherent|n°|numéro|numero)\s*(?:n°|no|numéro|numero)?\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/gi, (m) => m[1], (m) => /\d/.test(m[1]));
  scan("numero", /\b\d{7,}\b/g);

  // Noms propres probables : 1 à 3 mots capitalisés en milieu de phrase.
  const NAME = /[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+(?:-[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)?(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+(?:-[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)?){0,2}/gu;
  for (const m of masked.matchAll(NAME)) {
    let words = m[0].split(/\s+/);
    let start = m.index;
    if (isSentenceStart(masked, start)) {
      // Premier mot en début de phrase : on ne garde que la suite éventuelle (« Merci Léa Martin »).
      start += words[0].length;
      words = words.slice(1);
      while (masked[start] === " ") start++;
    }
    words = words.filter((w) => !COMMON_CAPS.has(w.toLowerCase()));
    if (!words.length) continue;
    const value = words.join(" ");
    const idx = text.indexOf(value, start);
    if (idx === -1) continue;
    add("nom", value, idx, idx + value.length);
  }

  // Compte toutes les occurrences (y compris en début de phrase) de chaque nom détecté.
  for (const item of found.values()) {
    if (item.type !== "nom") continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
    item.count = Math.max(item.count, (masked.match(re) || []).length);
  }

  const order = Object.keys(DETECT_TYPES);
  return [...found.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || b.count - a.count);
}

if (typeof module !== "undefined") module.exports = { detectSensitive, DETECT_TYPES };
