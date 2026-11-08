// Transcription audio -> texte via l'API Mistral (Voxtral).
// Doc : https://docs.mistral.ai/api/endpoint/audio/transcriptions
//
// Stratégie : on tente d'abord une transcription avec séparation des
// intervenants (diarize) et segments horodatés. Si l'API refuse cette
// combinaison de paramètres, on retombe sur une transcription simple en
// français. Le texte produit reste un brouillon à relire.

const MISTRAL_URL = "https://api.mistral.ai/v1/audio/transcriptions";
const MODEL = process.env.MISTRAL_TRANSCRIPTION_MODEL || "voxtral-mini-latest";

function formatTime(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Le format exact des segments diarisés n'est pas entièrement documenté :
// on lit les champs de manière défensive.
function speakerOf(seg) {
  const v = seg.speaker_id ?? seg.speaker ?? seg.speaker_label ?? null;
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return `Intervenant ${v + 1}`;
  const n = /(\d+)\s*$/.exec(String(v));
  return n ? `Intervenant ${Number(n[1]) + 1}` : String(v);
}

export function formatTranscript(result) {
  const segments = Array.isArray(result?.segments) ? result.segments : [];
  if (segments.length === 0) return (result?.text || "").trim();

  const lines = [];
  let current = null;
  for (const seg of segments) {
    const text = (seg.text || "").trim();
    if (!text) continue;
    const speaker = speakerOf(seg);
    if (current && current.speaker === speaker) {
      current.text += " " + text;
    } else {
      if (current) lines.push(current);
      current = { speaker, start: seg.start, text };
    }
  }
  if (current) lines.push(current);

  return lines
    .map((l) => {
      const t = formatTime(l.start);
      const prefix = [t && `[${t}]`, l.speaker && `${l.speaker} :`].filter(Boolean).join(" ");
      return prefix ? `${prefix} ${l.text}` : l.text;
    })
    .join("\n");
}

async function callMistral(fields, file) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    const err = new Error("MISTRAL_API_KEY manquante dans le fichier .env du serveur.");
    err.status = 500;
    throw err;
  }
  const form = new FormData();
  form.append("model", MODEL);
  for (const [key, value] of fields) form.append(key, value);
  form.append("file", new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" }), file.originalname || "reunion.webm");

  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`Mistral a répondu ${res.status} : ${body.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(body);
}

/**
 * @param {{buffer: Buffer, mimetype: string, originalname: string}} file
 * @param {{vocabulaire?: string[]}} options
 */
export async function transcribe(file, { vocabulaire = [] } = {}) {
  const bias = vocabulaire.map((w) => w.trim()).filter(Boolean).slice(0, 100);

  // 1er essai : diarisation + segments (+ vocabulaire métier).
  const rich = [["diarize", "true"], ["timestamp_granularities", "segment"]];
  for (const w of bias) rich.push(["context_bias", w]);

  const attempts = [
    { label: "intervenants", fields: rich },
    { label: "simple", fields: [["language", "fr"]] },
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const result = await callMistral(attempt.fields, file);
      return {
        mode: attempt.label,
        text: formatTranscript(result),
        language: result.language ?? null,
        audioSeconds: result.usage?.prompt_audio_seconds ?? null,
      };
    } catch (err) {
      lastError = err;
      // On ne réessaie que si la requête a été jugée invalide (paramètres).
      if (![400, 422].includes(err.status)) throw err;
      console.warn(`[transcription] essai "${attempt.label}" refusé : ${err.message}`);
    }
  }
  throw lastError;
}
