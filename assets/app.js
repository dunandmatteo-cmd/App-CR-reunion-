"use strict";

// ---------------------------------------------------------------------------
// État + brouillon local (navigateur de ton ordinateur uniquement)
// ---------------------------------------------------------------------------
const STORE_KEY = "cr-asso-brouillon-v1";
const META_FIELDS = ["titre", "date", "lieu", "type", "president", "secretaire", "nbMembres", "participants", "consignes"];
const state = { transcript: "", anon: [], cr: null };
const $ = (id) => document.getElementById(id);

function saveDraft() {
  try {
    const meta = Object.fromEntries(META_FIELDS.map((f) => [f, $(`m-${f}`).value]));
    localStorage.setItem(STORE_KEY, JSON.stringify({ meta, transcript: state.transcript, anon: state.anon, cr: state.cr, response: $("response").value }));
  } catch { /* stockage indisponible : on continue sans */ }
}

function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!d) return;
    for (const f of META_FIELDS) if (d.meta?.[f] !== undefined) $(`m-${f}`).value = d.meta[f];
    state.transcript = d.transcript || "";
    $("transcript").value = state.transcript;
    state.anon = Array.isArray(d.anon) ? d.anon : [];
    $("response").value = d.response || "";
    if (d.cr) showCR(d.cr);
  } catch { /* brouillon illisible : ignoré */ }
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

function addAnon(nom = "", restaurer = false) {
  if (nom && state.anon.some((a) => a.nom.trim().toLowerCase() === nom.trim().toLowerCase())) return;
  state.anon.push({ nom, pseudo: nextPseudo(), restaurer });
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
function currentPrompt() {
  const { text, count } = anonymize(state.transcript);
  return { prompt: buildPrompt(text, anonymizeMeta(getMeta())), count };
}

function anonymizeMeta(meta) {
  const out = { ...meta };
  for (const k of ["president", "secretaire", "participants", "consignes"]) out[k] = anonymize(out[k] || "").text;
  return out;
}

function updateInfos() {
  const words = state.transcript.trim() ? state.transcript.trim().split(/\s+/).length : 0;
  $("transcript-info").textContent = words ? `${words.toLocaleString("fr-FR")} mots` : "";
  const { prompt, count } = currentPrompt();
  $("anon-info").textContent = activeAnon().length ? `${count} remplacement(s) effectué(s) dans la transcription et les informations.` : "";
  $("prompt-preview").value = prompt;
  $("prompt-info").textContent = words ? `≈ ${Math.round(prompt.length / 1000)} k caractères` : "";
}

async function copyPrompt() {
  if (state.transcript.trim().length < 20) return alert("Importe ou colle d'abord la transcription (étape 2).");
  if (!activeAnon().length && !confirm("Aucun nom à anonymiser n'est défini. Envoyer quand même la transcription telle quelle ?")) return;
  const { prompt } = currentPrompt();
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
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  for (const f of ["titre", "lieu", "consignes"]) $(`m-${f}`).value = "";
  $("response").value = "";
  state.transcript = "";
  state.cr = null;
  saveDraft(); // garde : noms à anonymiser, participants, président, secrétaire
  location.reload();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
function init() {
  $("m-date").value = new Date().toISOString().slice(0, 10);
  loadDraft();
  renderAnon();
  updateInfos();

  for (const f of META_FIELDS) $(`m-${f}`).addEventListener("input", () => { updateInfos(); saveDraft(); });
  $("file").addEventListener("change", (e) => e.target.files?.[0] && importFile(e.target.files[0]));
  $("transcript").addEventListener("input", () => { state.transcript = $("transcript").value; updateInfos(); saveDraft(); });
  $("btn-anon-add").addEventListener("click", () => addAnon());
  $("btn-anon-participants").addEventListener("click", addParticipants);
  $("btn-copy-prompt").addEventListener("click", copyPrompt);
  $("response").addEventListener("input", saveDraft);
  $("btn-import").addEventListener("click", importResponse);
  $("btn-word").addEventListener("click", () => guardedExport(() => exportWord(state.cr, { inclureVerifs: $("opt-verifs").checked })));
  $("btn-excel").addEventListener("click", () => guardedExport(() => exportExcel(state.cr)));
  $("btn-reset").addEventListener("click", resetAll);
}

init();
