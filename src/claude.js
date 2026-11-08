// Génération du compte rendu (brouillon) à partir de la transcription, avec Claude.
// Sortie imposée par un schéma JSON (structured outputs) pour pouvoir
// éditer le CR et exporter les actions dans Excel sans ré-analyse.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

const str = { type: "string" };
const obj = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const CR_SCHEMA = obj({
  titre: str,
  date: str,
  lieu: str,
  type_reunion: str,
  animateur: str,
  redacteur: str,
  participants: { type: "array", items: obj({ nom: str, fonction: str }) },
  absents_excuses: { type: "array", items: str },
  objet: str,
  synthese: str,
  points_abordes: { type: "array", items: obj({ sujet: str, resume: str }) },
  decisions: { type: "array", items: obj({ decision: str, porteur: str }) },
  actions: {
    type: "array",
    items: obj({
      action: str,
      responsable: str,
      delai: str,
      priorite: { type: "string", enum: ["Haute", "Moyenne", "Basse", "Non précisée"] },
      reference: str,
      origine: str,
    }),
  },
  points_ouverts: { type: "array", items: str },
  points_a_verifier: { type: "array", items: obj({ passage: str, raison: str }) },
  prochaine_reunion: str,
});

const SYSTEM_PROMPT = `Tu rédiges des comptes rendus de réunion pour une entreprise industrielle spécialisée dans le soudage (Haute-Savoie). Les réunions portent souvent sur la qualité produit : non-conformités, réclamations clients, actions correctives et préventives, 8D, analyses de causes, procédés de soudage (MIG/MAG, TIG, soudage par points, etc.), qualification des opérateurs et des modes opératoires, contrôles, audits, exigences clients.

Ton compte rendu est un BROUILLON qui sera relu et validé par un humain avant diffusion. La fidélité prime sur l'élégance.

Règles impératives :
1. N'invente rien. Chaque décision, action, responsable, délai ou chiffre doit provenir de la transcription ou des informations fournies.
2. Si un responsable ou un délai n'est pas clairement énoncé, écris exactement "À définir". Ne déduis pas un responsable de la fonction d'une personne.
3. Distingue une décision prise (validée en réunion) d'une simple proposition ou d'une discussion. Une proposition non validée va dans "points_ouverts", pas dans "decisions".
4. Recopie à l'identique les références (numéros de NC, de réclamation, de 8D, de lot, de plan, de WPS/DMOS, cotes, valeurs mesurées). Si une référence est inaudible ou douteuse, signale-la dans "points_a_verifier".
5. La transcription automatique contient des erreurs (bruit, termes techniques déformés, chevauchements). Quand un passage est ambigu ou probablement mal transcrit, signale-le dans "points_a_verifier" avec la raison, au lieu de deviner.
6. Les intervenants de la transcription sont étiquetés "Intervenant 1", "Intervenant 2", etc. Ne les associe à un nom de participant que si c'est explicite (la personne se nomme ou est interpellée sans ambiguïté). Sinon, reste générique.
7. "reference" d'une action : numéro de NC, réclamation, 8D ou document s'il est cité, sinon chaîne vide. "origine" : le sujet ou la décision dont découle l'action.
8. "priorite" : seulement si elle est exprimée ou évidente d'après la réunion (ex. client en arrêt de ligne, risque sécurité) ; sinon "Non précisée".
9. Pour un champ texte sans information, utilise une chaîne vide (ou "À définir" pour responsable et délai d'action). Pour une liste vide, renvoie [].
10. Style : français professionnel, phrases courtes et factuelles, sans formules de politesse ni jugement sur les personnes.`;

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error("ANTHROPIC_API_KEY manquante dans le fichier .env du serveur.");
    err.status = 500;
    throw err;
  }
  client ??= new Anthropic();
  return client;
}

function buildUserMessage(transcript, meta = {}) {
  const lines = [
    "Informations saisies par l'utilisateur (prioritaires sur la transcription en cas de conflit) :",
    `- Titre : ${meta.titre || "(non renseigné)"}`,
    `- Date : ${meta.date || "(non renseignée)"}`,
    `- Lieu : ${meta.lieu || "(non renseigné)"}`,
    `- Type de réunion : ${meta.type || "(non renseigné)"}`,
    `- Animateur : ${meta.animateur || "(non renseigné)"}`,
    `- Rédacteur : ${meta.redacteur || "(non renseigné)"}`,
    `- Participants annoncés :\n${meta.participants?.trim() ? meta.participants.trim() : "(non renseignés)"}`,
  ];
  if (meta.consignes?.trim()) {
    lines.push(`- Consignes particulières : ${meta.consignes.trim()}`);
  }
  return `${lines.join("\n")}\n\nTranscription automatique de la réunion :\n<transcription>\n${transcript}\n</transcription>\n\nRédige le compte rendu selon le schéma demandé.`;
}

export async function generateCompteRendu(transcript, meta) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: CR_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(transcript, meta) }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    const err = new Error("La génération a été refusée par le modèle. Vérifie le contenu de la transcription.");
    err.status = 422;
    throw err;
  }
  if (message.stop_reason === "max_tokens") {
    const err = new Error("Compte rendu tronqué (réunion trop longue). Découpe la transcription et réessaie.");
    err.status = 422;
    throw err;
  }

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    cr: JSON.parse(text),
    model: message.model,
    usage: message.usage,
  };
}

export { Anthropic };
