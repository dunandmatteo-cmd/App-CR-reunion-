"use strict";

// ---------------------------------------------------------------------------
// État + persistance locale (brouillon de la réunion en cours)
// ---------------------------------------------------------------------------
const STORE_KEY = "cr-reunion-brouillon-v1";
const state = { audio: null, audioName: "", transcript: "", cr: null, maxAudioMb: 300 };

const $ = (id) => document.getElementById(id);
const META_FIELDS = ["titre", "date", "lieu", "type", "animateur", "redacteur", "participants", "vocab", "consignes"];

function saveDraft() {
  try {
    const meta = Object.fromEntries(META_FIELDS.map((f) => [f, $(`m-${f}`).value]));
    localStorage.setItem(STORE_KEY, JSON.stringify({ meta, transcript: state.transcript, cr: state.cr }));
  } catch { /* stockage indisponible : on continue sans */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    for (const f of META_FIELDS) if (d.meta?.[f] !== undefined) $(`m-${f}`).value = d.meta[f];
    if (d.transcript) showTranscript(d.transcript);
    if (d.cr) showCR(d.cr);
  } catch { /* brouillon illisible : ignoré */ }
}

function getMeta() {
  return {
    titre: $("m-titre").value.trim(),
    date: $("m-date").value ? $("m-date").value.split("-").reverse().join("/") : "",
    lieu: $("m-lieu").value.trim(),
    type: $("m-type").value,
    animateur: $("m-animateur").value.trim(),
    redacteur: $("m-redacteur").value.trim(),
    participants: $("m-participants").value,
    consignes: $("m-consignes").value,
  };
}

// ---------------------------------------------------------------------------
// Utilitaires UI
// ---------------------------------------------------------------------------
function busy(on, msg = "Traitement…") {
  $("busy").hidden = !on;
  $("busy-msg").textContent = msg;
}

async function api(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try { msg = (await res.json()).error || msg; } catch { /* réponse non JSON */ }
    throw new Error(msg);
  }
  return res;
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
}

// ---------------------------------------------------------------------------
// Sauvegarde des morceaux d'enregistrement dans IndexedDB
// (permet de récupérer l'audio si l'onglet se ferme ou plante)
// ---------------------------------------------------------------------------
const idb = {
  db: null,
  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("cr-reunion-audio", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("chunks", { autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction("chunks", mode);
      const out = fn(t.objectStore("chunks"));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
    });
  },
  add(chunk) { return this.tx("readwrite", (s) => s.add(chunk)).catch(() => {}); },
  all() { return this.tx("readonly", (s) => s.getAll()).catch(() => []); },
  clear() { return this.tx("readwrite", (s) => s.clear()).catch(() => {}); },
};

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------
const rec = { recorder: null, stream: null, chunks: [], mime: "", start: 0, elapsed: 0, timer: null, wakeLock: null, ctx: null, raf: 0 };

function pickMime() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
}

function extFor(mime) {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

async function requestWakeLock() {
  try { rec.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* non supporté */ }
}

function startMeter(stream) {
  try {
    rec.ctx = new AudioContext();
    const analyser = rec.ctx.createAnalyser();
    analyser.fftSize = 512;
    rec.ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const canvas = $("meter");
    const g = canvas.getContext("2d");
    const draw = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
      const level = Math.min(1, peak / 90);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = level > 0.85 ? "#c0392b" : "#2e7d32";
      g.fillRect(0, 0, canvas.width * level, canvas.height);
      rec.raf = requestAnimationFrame(draw);
    };
    draw();
  } catch { /* vumètre facultatif */ }
}

function tick() {
  const total = rec.elapsed + (rec.recorder?.state === "recording" ? Date.now() - rec.start : 0);
  $("timer").textContent = fmtTime(total);
}

async function startRecording() {
  if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
    alert("Ce navigateur ne permet pas l'enregistrement. Utilise Chrome, Edge, Firefox ou Safari récent, en HTTPS.");
    return;
  }
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (err) {
    alert(`Micro inaccessible : ${err.message}\n(L'enregistrement nécessite HTTPS, ou localhost sur le PC.)`);
    return;
  }
  await idb.clear();
  rec.mime = pickMime();
  rec.chunks = [];
  rec.elapsed = 0;
  rec.recorder = new MediaRecorder(rec.stream, rec.mime ? { mimeType: rec.mime, audioBitsPerSecond: 32000 } : undefined);
  rec.mime = rec.recorder.mimeType || rec.mime || "audio/webm";
  rec.recorder.ondataavailable = (e) => {
    if (e.data && e.data.size) {
      rec.chunks.push(e.data);
      idb.add(e.data);
    }
  };
  rec.recorder.onstop = finishRecording;
  rec.recorder.start(10_000); // un morceau toutes les 10 s
  rec.start = Date.now();
  rec.timer = setInterval(tick, 500);
  await requestWakeLock();
  startMeter(rec.stream);

  document.querySelector(".rec").classList.add("recording");
  $("btn-rec").disabled = true;
  $("btn-pause").disabled = false;
  $("btn-stop").disabled = false;
  $("file").disabled = true;
}

function togglePause() {
  const r = rec.recorder;
  if (!r) return;
  if (r.state === "recording") {
    r.pause();
    rec.elapsed += Date.now() - rec.start;
    $("btn-pause").textContent = "Reprendre";
  } else if (r.state === "paused") {
    r.resume();
    rec.start = Date.now();
    $("btn-pause").textContent = "Pause";
  }
}

function stopRecording() {
  const r = rec.recorder;
  if (!r || r.state === "inactive") return;
  if (r.state === "recording") rec.elapsed += Date.now() - rec.start;
  r.stop();
}

function finishRecording() {
  clearInterval(rec.timer);
  cancelAnimationFrame(rec.raf);
  rec.ctx?.close().catch(() => {});
  rec.stream?.getTracks().forEach((t) => t.stop());
  rec.wakeLock?.release?.().catch(() => {});
  rec.recorder = null;
  tick();

  document.querySelector(".rec").classList.remove("recording");
  $("btn-rec").disabled = !$("consent").checked;
  $("btn-pause").disabled = true;
  $("btn-pause").textContent = "Pause";
  $("btn-stop").disabled = true;
  $("file").disabled = false;

  const blob = new Blob(rec.chunks, { type: rec.mime });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  setAudio(blob, `reunion_${stamp}.${extFor(rec.mime)}`);
}

function setAudio(blob, name) {
  state.audio = blob;
  state.audioName = name;
  const url = URL.createObjectURL(blob);
  $("player").src = url;
  $("dl-audio").href = url;
  $("dl-audio").download = name;
  $("audio-box").hidden = false;
  const mb = blob.size / 1024 / 1024;
  if (mb > state.maxAudioMb) {
    alert(`Fichier de ${mb.toFixed(0)} Mo : au-delà de la limite du serveur (${state.maxAudioMb} Mo).`);
  }
}

async function offerRecovery() {
  const chunks = await idb.all();
  if (!chunks.length) return;
  const type = chunks[0].type || "audio/webm";
  const blob = new Blob(chunks, { type });
  const mb = (blob.size / 1024 / 1024).toFixed(1);
  if (confirm(`Un enregistrement non terminé a été retrouvé (${mb} Mo). Le récupérer ?`)) {
    setAudio(blob, `reunion_recuperee.${extFor(type)}`);
  } else {
    await idb.clear();
  }
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------
async function doTranscribe() {
  if (!state.audio) return;
  if (!$("consent").checked) {
    alert("Coche d'abord la case d'information des participants.");
    return;
  }
  busy(true, "Transcription en cours… (compter environ 1 à 3 min pour 1 h d'audio)");
  try {
    const form = new FormData();
    form.append("audio", state.audio, state.audioName || "reunion.webm");
    form.append("vocabulaire", $("m-vocab").value);
    const res = await api("/api/transcribe", { method: "POST", body: form });
    const data = await res.json();
    showTranscript(data.text);
    if (data.mode === "simple") {
      alert("Transcription réalisée sans séparation des intervenants (option refusée par le service).");
    }
    await idb.clear();
    saveDraft();
    $("step-transcript").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    alert(`Échec de la transcription : ${err.message}\n\nL'audio est conservé : tu peux le télécharger et réessayer.`);
  } finally {
    busy(false);
  }
}

function showTranscript(text) {
  state.transcript = text || "";
  $("transcript").value = state.transcript;
  $("step-transcript").hidden = false;
}

// ---------------------------------------------------------------------------
// Génération du CR
// ---------------------------------------------------------------------------
async function doGenerate() {
  state.transcript = $("transcript").value;
  if (state.transcript.trim().length < 20) {
    alert("La transcription est vide ou trop courte.");
    return;
  }
  if (state.cr && !confirm("Régénérer le compte rendu ? Tes modifications actuelles du CR seront perdues.")) return;
  busy(true, "Rédaction du compte rendu… (peut prendre 1 à 2 min)");
  try {
    const res = await api("/api/compte-rendu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: state.transcript, meta: getMeta() }),
    });
    const data = await res.json();
    showCR(data.cr);
    saveDraft();
    $("step-cr").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    alert(`Échec de la génération : ${err.message}`);
  } finally {
    busy(false);
  }
}

// ---------------------------------------------------------------------------
// Rendu éditable du CR
// ---------------------------------------------------------------------------
const TABLES = {
  participants: { title: "Participants", cols: [["nom", "Nom"], ["fonction", "Fonction"]] },
  points_abordes: { title: "Points abordés", cols: [["sujet", "Sujet"], ["resume", "Résumé", "area"]] },
  decisions: { title: "Décisions", cols: [["decision", "Décision", "area"], ["porteur", "Porteur"]] },
  actions: {
    title: "Plan d'actions",
    cols: [
      ["action", "Action", "area"],
      ["responsable", "Responsable"],
      ["delai", "Délai"],
      ["priorite", "Priorité", ["Haute", "Moyenne", "Basse", "Non précisée"]],
      ["reference", "Réf. NC / 8D"],
      ["origine", "Origine", "area"],
    ],
  },
  points_a_verifier: { title: "Points à vérifier (transcription douteuse)", cols: [["passage", "Passage"], ["raison", "Raison", "area"]] },
};
const LISTS = { absents_excuses: "Absents / excusés", points_ouverts: "Points ouverts / non tranchés" };
const FIELDS = [
  ["titre", "Titre"], ["date", "Date"], ["lieu", "Lieu"], ["type_reunion", "Type"],
  ["animateur", "Animateur"], ["redacteur", "Rédacteur"],
];

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

function markTbd(input) {
  input.classList.toggle("tbd", /à définir/i.test(input.value) || input.value.trim() === "");
}

function editor(value, onInput, type) {
  let input;
  if (Array.isArray(type)) {
    input = el("select", {}, type.map((o) => el("option", { text: o })));
    input.value = value;
  } else if (type === "area") {
    input = el("textarea", { rows: 2 });
    input.value = value ?? "";
    requestAnimationFrame(() => autoGrow(input));
  } else {
    input = el("input");
    input.value = value ?? "";
  }
  input.addEventListener("input", () => {
    onInput(input.value);
    if (input.tagName === "TEXTAREA") autoGrow(input);
    saveDraft();
  });
  return input;
}

function renderCR() {
  const root = $("cr");
  root.replaceChildren();
  const cr = state.cr;

  const head = el("div", { class: "grid" });
  for (const [k, label] of FIELDS) {
    head.append(el("label", { text: label }, editor(cr[k], (v) => (cr[k] = v))));
  }
  root.append(head);

  for (const [k, label] of [["objet", "Objet de la réunion"], ["synthese", "Synthèse"]]) {
    root.append(el("label", { text: label }, editor(cr[k], (v) => (cr[k] = v), "area")));
  }

  root.append(renderTable("participants"));
  root.append(renderList("absents_excuses"));
  root.append(renderTable("points_abordes"));
  root.append(renderTable("decisions"));
  root.append(renderTable("actions"));
  root.append(renderList("points_ouverts"));
  root.append(renderTable("points_a_verifier"));
  root.append(el("label", { text: "Prochaine réunion" }, editor(cr.prochaine_reunion, (v) => (cr.prochaine_reunion = v))));
}

function renderTable(key) {
  const { title, cols } = TABLES[key];
  const rows = (state.cr[key] ||= []);
  const tbody = el("tbody");
  rows.forEach((row, i) => {
    const tr = el("tr");
    for (const [field, , type] of cols) {
      const input = editor(row[field], (v) => {
        row[field] = v;
        if (key === "actions" && (field === "responsable" || field === "delai")) markTbd(input);
      }, type);
      if (key === "actions" && (field === "responsable" || field === "delai")) markTbd(input);
      tr.append(el("td", {}, input));
    }
    tr.append(el("td", {}, el("button", {
      class: "icon-btn danger", title: "Supprimer", text: "✕",
      onclick: () => { rows.splice(i, 1); saveDraft(); renderCR(); },
    })));
    tbody.append(tr);
  });
  const table = el("table", {}, [
    el("thead", {}, el("tr", {}, [...cols.map(([, l]) => el("th", { text: l })), el("th")])),
    tbody,
  ]);
  const add = el("button", {
    class: "icon-btn", text: "+ Ajouter une ligne",
    onclick: () => {
      const blank = Object.fromEntries(cols.map(([f, , t]) => [f, Array.isArray(t) ? t[t.length - 1] : (key === "actions" && (f === "responsable" || f === "delai") ? "À définir" : "")]));
      rows.push(blank); saveDraft(); renderCR();
    },
  });
  return el("div", { class: "cr-section" }, [el("h3", { text: `${title} (${rows.length})` }), el("div", { class: "table-wrap" }, table), add]);
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
  state.cr = cr;
  $("step-cr").hidden = false;
  renderCR();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
async function doExcel() {
  busy(true, "Création du fichier Excel…");
  try {
    const res = await api("/api/export-excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cr: state.cr }),
    });
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "CR_reunion.xlsx";
    const a = el("a", { href: URL.createObjectURL(blob), download: name });
    document.body.append(a);
    a.click();
    a.remove();
  } catch (err) {
    alert(`Échec de l'export : ${err.message}`);
  } finally {
    busy(false);
  }
}

function crToText(cr) {
  const L = [];
  L.push(`COMPTE RENDU – ${cr.titre}`.toUpperCase());
  L.push([cr.date && `Date : ${cr.date}`, cr.lieu && `Lieu : ${cr.lieu}`, cr.type_reunion && `Type : ${cr.type_reunion}`].filter(Boolean).join(" | "));
  if (cr.animateur) L.push(`Animateur : ${cr.animateur}`);
  if (cr.redacteur) L.push(`Rédacteur : ${cr.redacteur}`);
  L.push("(Brouillon généré automatiquement – à valider)");
  if (cr.participants?.length) L.push("", "Participants :", ...cr.participants.map((p) => `- ${p.nom}${p.fonction ? ` (${p.fonction})` : ""}`));
  if (cr.absents_excuses?.length) L.push(`Absents / excusés : ${cr.absents_excuses.join(", ")}`);
  if (cr.objet) L.push("", `Objet : ${cr.objet}`);
  if (cr.synthese) L.push("", "Synthèse :", cr.synthese);
  if (cr.points_abordes?.length) L.push("", "Points abordés :", ...cr.points_abordes.map((p, i) => `${i + 1}. ${p.sujet} – ${p.resume}`));
  if (cr.decisions?.length) L.push("", "Décisions :", ...cr.decisions.map((d, i) => `${i + 1}. ${d.decision}${d.porteur ? ` (porteur : ${d.porteur})` : ""}`));
  if (cr.actions?.length) {
    L.push("", "Actions :");
    cr.actions.forEach((a, i) => L.push(`${i + 1}. ${a.action} | Resp. : ${a.responsable} | Délai : ${a.delai}${a.priorite && a.priorite !== "Non précisée" ? ` | Priorité : ${a.priorite}` : ""}${a.reference ? ` | Réf. : ${a.reference}` : ""}`));
  }
  if (cr.points_ouverts?.length) L.push("", "Points ouverts :", ...cr.points_ouverts.map((p) => `- ${p}`));
  if (cr.prochaine_reunion) L.push("", `Prochaine réunion : ${cr.prochaine_reunion}`);
  return L.join("\n");
}

async function doCopy() {
  const text = crToText(state.cr);
  try {
    await navigator.clipboard.writeText(text);
    alert("Compte rendu copié dans le presse-papiers.");
  } catch {
    prompt("Copie le texte ci-dessous :", text);
  }
}

async function doReset() {
  if (!confirm("Effacer la réunion en cours (audio, transcription et CR) ?")) return;
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  await idb.clear();
  location.reload();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
async function init() {
  $("m-date").value = new Date().toISOString().slice(0, 10);
  loadDraft();
  for (const f of META_FIELDS) $(`m-${f}`).addEventListener("input", saveDraft);

  $("consent").addEventListener("change", () => {
    $("btn-rec").disabled = !$("consent").checked || Boolean(rec.recorder);
  });
  $("btn-rec").addEventListener("click", startRecording);
  $("btn-pause").addEventListener("click", togglePause);
  $("btn-stop").addEventListener("click", stopRecording);
  $("file").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) setAudio(f, f.name);
  });
  $("btn-transcribe").addEventListener("click", doTranscribe);
  $("transcript").addEventListener("input", () => { state.transcript = $("transcript").value; saveDraft(); });
  $("btn-generate").addEventListener("click", doGenerate);
  $("btn-excel").addEventListener("click", doExcel);
  $("btn-copy").addEventListener("click", doCopy);
  $("btn-reset").addEventListener("click", doReset);

  window.addEventListener("beforeunload", (e) => {
    if (rec.recorder) { e.preventDefault(); e.returnValue = ""; }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && rec.recorder) requestWakeLock();
  });

  try {
    const s = await (await fetch("/api/status")).json();
    state.maxAudioMb = s.maxAudioMb || state.maxAudioMb;
    const parts = [];
    parts.push(s.transcription ? "Transcription : OK" : '<span class="bad">Transcription : clé Mistral manquante</span>');
    parts.push(s.redaction ? "Rédaction : OK" : '<span class="bad">Rédaction : clé Anthropic manquante</span>');
    $("status").innerHTML = parts.join(" · ");
  } catch {
    $("status").innerHTML = '<span class="bad">Serveur injoignable</span>';
  }

  offerRecovery();
}

init();
