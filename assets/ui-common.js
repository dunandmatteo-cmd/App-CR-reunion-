"use strict";
// Socle de l'interface : état de la réunion, brouillon (chiffré via vault.js), petits utilitaires DOM.

const META_FIELDS = ["titre", "date", "lieu", "type", "president", "secretaire", "nbMembres", "participants", "consignes"];
const AUTO_LOCK_MIN = 15;

const state = {
  transcript: "",
  anon: [],         // [{ nom, pseudo, restaurer }]           conservé d'une réunion à l'autre
  ignore: [],       // valeurs écartées de la détection         conservé
  corrections: [],  // [{ de, vers }] erreurs de transcription  conservé
  speakers: {},     // { S01: "Marc Dupont" }                    propre à la réunion
  exclusions: [],   // [{ n, texte }]                            propre à la réunion
  exclCounter: 0,
  cr: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "text") e.textContent = v;
    else if (k === "value") e.value = v;
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

function getMeta() {
  const m = Object.fromEntries(META_FIELDS.map((f) => [f, $(`m-${f}`).value.trim()]));
  if (m.date) m.date = m.date.split("-").reverse().join("/");
  return m;
}

function participantNames() {
  return $("m-participants").value.split("\n").map((l) => l.split(/\s[–-]\s|,|\(/)[0].trim()).filter(Boolean);
}

// --- Brouillon ---------------------------------------------------------------------
function draftData() {
  return {
    meta: Object.fromEntries(META_FIELDS.map((f) => [f, $(`m-${f}`).value])),
    transcript: state.transcript,
    anon: state.anon,
    ignore: state.ignore,
    corrections: state.corrections,
    speakers: state.speakers,
    exclusions: state.exclusions,
    exclCounter: state.exclCounter,
    cr: state.cr,
    response: $("response").value,
  };
}

function saveDraft() {
  vault.save(draftData());
}

function applyDraft(d) {
  if (!d) return;
  for (const f of META_FIELDS) if (d.meta?.[f] !== undefined) $(`m-${f}`).value = d.meta[f];
  const arr = (v) => (Array.isArray(v) ? v : []);
  state.transcript = d.transcript || "";
  state.anon = arr(d.anon);
  state.ignore = arr(d.ignore);
  state.corrections = arr(d.corrections);
  state.speakers = d.speakers && typeof d.speakers === "object" ? d.speakers : {};
  state.exclusions = arr(d.exclusions);
  state.exclCounter = Number(d.exclCounter) || state.exclusions.length;
  $("transcript").value = state.transcript;
  $("response").value = d.response || "";
  if (d.cr) showCR(d.cr);
}

// --- Fichiers -------------------------------------------------------------------------
function downloadBlob(blob, name) {
  const a = el("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Charge une bibliothèque (Word, Excel) seulement quand on en a besoin.
const loadedScripts = {};
function loadScript(src) {
  loadedScripts[src] ||= new Promise((resolve, reject) => {
    const s = el("script", { src });
    s.onload = resolve;
    s.onerror = () => {
      delete loadedScripts[src];
      reject(new Error(`bibliothèque introuvable (${src}). Vérifie que le dossier assets/vendor est complet.`));
    };
    document.head.append(s);
  });
  return loadedScripts[src];
}
