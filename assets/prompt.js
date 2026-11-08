"use strict";
// Consignes envoyées (par copier-coller) à Claude.ai pour rédiger le compte rendu.
// La réponse attendue est un bloc JSON unique, réimporté ensuite dans l'app.

const CR_EXEMPLE = {
  titre: "Réunion de bureau",
  date: "JJ/MM/AAAA",
  lieu: "",
  type_reunion: "Bureau | Comité directeur / CA | Commission / entraîneurs | Autre",
  president_seance: "",
  secretaire_seance: "",
  participants: [{ nom: "", qualite: "Président, trésorier, entraîneur…" }],
  absents_excuses: [""],
  invites: [""],
  quorum: "Ex. « Atteint : 9 membres présents sur 12 » ou « Non précisé »",
  ordre_du_jour: [""],
  points: [{ sujet: "", resume: "" }],
  deliberations: [
    {
      objet: "",
      decision: "",
      resultat: "Adoptée | Rejetée | Reportée | Non précisé",
      pour: "nombre, « Unanimité » ou « ? »",
      contre: "nombre ou « ? »",
      abstention: "nombre ou « ? »",
      commentaire: "",
    },
  ],
  actions: [{ action: "", responsable: "", delai: "", priorite: "Haute | Moyenne | Basse | Non précisée", sujet: "" }],
  points_ouverts: [""],
  points_sensibles: [{ passage: "", raison: "" }],
  points_a_verifier: [{ passage: "", raison: "" }],
  prochaine_reunion: "",
};

const CONSIGNES = `Tu es le secrétaire de séance d'un club de natation associatif (association loi 1901, Seynod, Haute-Savoie). À partir de la transcription automatique ci-dessous, rédige le compte rendu de la réunion.

Le compte rendu est un BROUILLON : il sera relu par un membre du bureau, puis mis en forme par le secrétaire. La fidélité prime sur le style.

RÈGLES
1. N'invente rien. Chaque décision, vote, action, responsable, délai, montant ou date doit venir de la transcription ou des informations de la réunion.
2. Action sans responsable ou sans délai clairement énoncé : écris exactement « À définir ».
3. Délibérations : ne mets dans « deliberations » que ce qui a été décidé ou soumis au vote. Une simple idée ou discussion va dans « points_ouverts ».
4. Votes : reporte pour / contre / abstention UNIQUEMENT s'ils sont énoncés. « À l'unanimité » donne pour = « Unanimité », contre = « 0 », abstention = « 0 ». Chiffre manquant ou inaudible : « ? », et ajoute une entrée dans « points_a_verifier ». Décision prise sans vote formel : resultat = « Adoptée », pour/contre/abstention = « - », commentaire = « Sans vote formel ».
5. Quorum : seulement s'il est mentionné ou calculable à partir des informations fournies (membres présents / membres du comité). Sinon « Non précisé ».
6. Les mentions entre crochets (« [Personne A] », « [Téléphone] », « [Adresse] », « [Commune] »…) sont des remplacements volontaires : recopie-les telles quelles, ne cherche pas à deviner ce qu'elles cachent.
7. Protection des personnes :
   - Ne nomme jamais un nageur ou une nageuse mineur(e). Désigne-le par sa catégorie ou son rôle (ex. « un nageur benjamin »).
   - Santé : aucun détail médical, écris seulement « raison de santé ».
   - Discipline, conflits, situations personnelles ou financières individuelles : reste factuel et neutre, sans jugement. Ajoute systématiquement une entrée dans « points_sensibles » pour que le relecteur décide de ce qui peut être diffusé.
8. La transcription contient des erreurs (mots déformés, noms écorchés, voix qui se chevauchent, intervenants parfois mal attribués). Si un passage est ambigu, signale-le dans « points_a_verifier » au lieu de deviner.
9. Intervenants : une réplique qui commence par un pseudonyme ou un nom suivi de « : » (« [Personne A] : … ») a été attribuée par le relecteur ; tu peux t'en servir pour savoir qui propose, vote ou prend une action. Une étiquette automatique restante (« S01 », « Speaker 1 »…) peut être fausse : ne la relie à une personne que si c'est explicite. La séparation automatique des voix peut se tromper : en cas de doute sur qui a dit quoi, ajoute une entrée dans « points_a_verifier ».
10. « [Passage retiré n°X : à rédiger manuellement] » signale un passage retiré volontairement. N'essaie pas d'en deviner le contenu. Ajoute dans « points » une entrée avec pour sujet « Passage retiré n°X » et pour résumé « À rédiger manuellement par le relecteur ». Ne crée aucune décision ni action à partir de ce passage.
11. Style : français simple et factuel, phrases courtes, pas de formules de politesse.

FORMAT DE RÉPONSE
Réponds UNIQUEMENT par un bloc de code \`\`\`json contenant un objet qui respecte exactement la structure ci-dessous (mêmes clés). Remplace les textes d'exemple. Champ sans information : chaîne vide "". Liste vide : [].

`;

function buildPrompt(transcript, meta) {
  const infos = [
    `- Titre : ${meta.titre || "(non renseigné)"}`,
    `- Date : ${meta.date || "(non renseignée)"}`,
    `- Lieu : ${meta.lieu || "(non renseigné)"}`,
    `- Type de réunion : ${meta.type || "(non renseigné)"}`,
    `- Président de séance : ${meta.president || "(non renseigné)"}`,
    `- Secrétaire de séance : ${meta.secretaire || "(non renseigné)"}`,
    `- Nombre de membres de l'instance (pour le quorum) : ${meta.nbMembres || "(non renseigné)"}`,
    `- Participants annoncés :\n${meta.participants?.trim() || "(non renseignés)"}`,
  ];
  if (meta.consignes?.trim()) infos.push(`- Consignes particulières : ${meta.consignes.trim()}`);

  return (
    CONSIGNES +
    "```json\n" + JSON.stringify(CR_EXEMPLE, null, 2) + "\n```\n\n" +
    "INFORMATIONS SAISIES (prioritaires sur la transcription en cas de conflit)\n" +
    infos.join("\n") +
    "\n\nTRANSCRIPTION\n<transcription>\n" + transcript.trim() + "\n</transcription>\n"
  );
}

// --- Lecture de la réponse de Claude ---------------------------------------------
function extractJson(text) {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  let candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Aucun objet JSON trouvé dans la réponse.");
  candidate = candidate.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new Error(`JSON invalide (${e.message}). Vérifie que la réponse a été copiée en entier.`);
  }
}

// Remet la réponse au format attendu, même si Claude a oublié ou mal typé des champs.
function normalizeCR(raw) {
  const s = (v) => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v));
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const rows = (v, keys) =>
    arr(v).map((r) => Object.fromEntries(keys.map((k) => [k, s(typeof r === "object" ? r[k] : k === keys[0] ? r : "")])));
  const strs = (v) => arr(v).map(s).filter((x) => x.trim() !== "");

  const cr = {};
  for (const k of ["titre", "date", "lieu", "type_reunion", "president_seance", "secretaire_seance", "quorum", "prochaine_reunion"]) {
    cr[k] = s(raw[k]);
  }
  cr.participants = rows(raw.participants, ["nom", "qualite"]).filter((p) => p.nom.trim());
  cr.absents_excuses = strs(raw.absents_excuses);
  cr.invites = strs(raw.invites);
  cr.ordre_du_jour = strs(raw.ordre_du_jour);
  cr.points = rows(raw.points, ["sujet", "resume"]);
  cr.deliberations = rows(raw.deliberations, ["objet", "decision", "resultat", "pour", "contre", "abstention", "commentaire"]);
  cr.actions = rows(raw.actions, ["action", "responsable", "delai", "priorite", "sujet"]).map((a) => ({
    ...a,
    responsable: a.responsable.trim() || "À définir",
    delai: a.delai.trim() || "À définir",
    priorite: ["Haute", "Moyenne", "Basse", "Non précisée"].includes(a.priorite) ? a.priorite : "Non précisée",
  }));
  cr.points_ouverts = strs(raw.points_ouverts);
  cr.points_sensibles = rows(raw.points_sensibles, ["passage", "raison"]);
  cr.points_a_verifier = rows(raw.points_a_verifier, ["passage", "raison"]);
  return cr;
}

if (typeof module !== "undefined") module.exports = { buildPrompt, extractJson, normalizeCR };
