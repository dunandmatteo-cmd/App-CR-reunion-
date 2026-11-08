"use strict";
// Détection des données identifiantes restantes dans le texte qui va partir.
// Heuristiques volontairement larges : mieux vaut une fausse alerte (bouton
// « Ignorer ») qu'un nom ou un numéro qui part en clair.

const DETECT_TYPES = {
  nom: { label: "Nom propre probable", pseudo: null },
  nom_debut: { label: "Nom possible (début de phrase)", pseudo: null },
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

// Mots courants en tête de phrase ou de réplique : tout autre mot capitalisé à cet endroit
// est signalé comme nom possible (« S02: Kevin, tu peux… »).
const STARTERS = new Set(
  (
    "a à ah ainsi alors après attends attendez au aucun aucune aujourd aussi autre autrement aux avant avec " +
    "bah ben bien bon bonne bref c ça ce cela celle celui cependant certains certes ces cet cette chacun chaque " +
    "ci comme comment concernant d dans de déjà depuis des donc du écoute écoutez effectivement eh elle elles en " +
    "encore enfin ensuite entre est et été êtes étant euh excusez exactement faut faudrait finalement hein hier " +
    "il ils j je jusqu l la là le les leur leurs lui m ma mais maintenant me même merci mes moi mon n ne ni non " +
    "nos notre nous on ou où ouais oui par parce pardon parmi pas peut peut-être peu plus plusieurs pour pourquoi " +
    "pourtant puis puisque qu quand que quel quelle quelles quels quelqu quelque quelques qui quoi rien s sa sans " +
    "se selon ses si sinon soit son sous sur surtout t ta tant te tes toi ton tous tout toute toutes très tu un une " +
    "voici voilà vos votre vous vraiment y ok okay d'accord bonjour bonsoir salut merci oui non super parfait " +
    "premier première deuxième troisième dernier dernière prochain prochaine point points question ordre budget " +
    "concernant proposition vote votes résultat adopté adoptée unanimité qui contre abstention abstentions " +
    "il y a voilà alors donc ensuite enfin dernièrement également justement normalement apparemment évidemment"
  ).split(/\s+/)
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

  // Noms propres probables : 1 à 3 mots capitalisés.
  // En début de phrase ou de réplique, le premier mot n'est retenu que s'il n'est pas un mot courant.
  const NAME = /[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+(?:-[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)?(?:\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+(?:-[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ]+)?){0,2}/gu;
  const isCommon = (w) => COMMON_CAPS.has(w.toLowerCase()) || STARTERS.has(w.toLowerCase());
  for (const m of masked.matchAll(NAME)) {
    let words = m[0].split(/\s+/);
    let start = m.index;
    let type = "nom";
    if (isSentenceStart(masked, start)) {
      if (isCommon(words[0])) {
        start += words[0].length;
        words = words.slice(1);
        while (masked[start] === " ") start++;
      } else if (words.length === 1) {
        type = "nom_debut"; // un seul mot inconnu en tête de phrase : nom possible
      }
    }
    words = words.filter((w) => !COMMON_CAPS.has(w.toLowerCase()));
    if (!words.length) continue;
    const value = words.join(" ");
    const idx = text.indexOf(value, start);
    if (idx === -1) continue;
    add(type, value, idx, idx + value.length);
  }

  // Un même mot signalé à la fois en début et en milieu de phrase : garder « nom ».
  for (const [key, item] of found) {
    if (item.type === "nom_debut" && found.has(`nom|${item.value.toLowerCase()}`)) found.delete(key);
  }

  // Compte toutes les occurrences (y compris en début de phrase) de chaque nom détecté.
  for (const item of found.values()) {
    if (item.type !== "nom" && item.type !== "nom_debut") continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${item.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "gu");
    item.count = Math.max(item.count, (masked.match(re) || []).length);
  }

  const order = Object.keys(DETECT_TYPES);
  return [...found.values()].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || b.count - a.count);
}

if (typeof module !== "undefined") module.exports = { detectSensitive, DETECT_TYPES };
