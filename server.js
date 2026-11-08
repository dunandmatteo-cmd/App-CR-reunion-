import "dotenv/config";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { transcribe } from "./src/transcription.js";
import { generateCompteRendu, Anthropic } from "./src/claude.js";
import { buildWorkbook } from "./src/excel.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_AUDIO_MB = Number(process.env.MAX_AUDIO_MB) || 300;

// --- Protection par mot de passe (recommandée dès que l'app est en ligne) --------
// Sans mot de passe, n'importe qui connaissant l'adresse pourrait consommer
// tes crédits API et envoyer des fichiers.
const APP_PASSWORD = process.env.APP_PASSWORD || "";
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const header = req.headers.authorization || "";
    const [scheme, encoded] = header.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const pwd = decoded.slice(decoded.indexOf(":") + 1);
      const a = Buffer.from(pwd);
      const b = Buffer.from(APP_PASSWORD);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    }
    res.set("WWW-Authenticate", 'Basic realm="CR reunion", charset="UTF-8"');
    res.status(401).send("Authentification requise.");
  });
} else {
  console.warn("[sécurité] APP_PASSWORD non défini : l'app est accessible sans mot de passe.");
}

app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(here, "public")));

// L'audio reste en mémoire le temps de la requête : il n'est jamais écrit sur
// le disque du serveur.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_MB * 1024 * 1024 },
});

app.get("/api/status", (_req, res) => {
  res.json({
    transcription: Boolean(process.env.MISTRAL_API_KEY),
    redaction: Boolean(process.env.ANTHROPIC_API_KEY),
    maxAudioMb: MAX_AUDIO_MB,
  });
});

app.post("/api/transcribe", upload.single("audio"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier audio reçu." });
    const vocabulaire = String(req.body.vocabulaire || "")
      .split(/[\n,;]/)
      .map((w) => w.trim())
      .filter(Boolean);
    const result = await transcribe(req.file, { vocabulaire });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/compte-rendu", async (req, res, next) => {
  try {
    const transcript = String(req.body?.transcript || "").trim();
    if (transcript.length < 20) {
      return res.status(400).json({ error: "Transcription vide ou trop courte." });
    }
    const result = await generateCompteRendu(transcript, req.body?.meta || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.post("/api/export-excel", async (req, res, next) => {
  try {
    const cr = req.body?.cr;
    if (!cr || typeof cr !== "object") return res.status(400).json({ error: "Compte rendu manquant." });
    const buffer = await buildWorkbook(cr);
    const safe = `${cr.date || ""}_${cr.titre || "reunion"}`
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CR_${safe || "reunion"}.xlsx"`,
    });
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

// --- Gestion des erreurs -----------------------------------------------------------
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: `Fichier audio trop volumineux (max ${MAX_AUDIO_MB} Mo).` });
  }
  let status = err.status || 500;
  let message = err.message || "Erreur interne.";
  if (err instanceof Anthropic.AuthenticationError) {
    message = "Clé API Anthropic invalide.";
  } else if (err instanceof Anthropic.RateLimitError) {
    message = "Limite de requêtes Anthropic atteinte, réessaie dans une minute.";
  } else if (err instanceof Anthropic.APIConnectionError) {
    status = 502;
    message = "Impossible de joindre l'API Anthropic.";
  }
  console.error(`[erreur ${status}]`, err.message);
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`App CR réunion : http://localhost:${PORT}`);
});
