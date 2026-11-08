"use strict";
// Étape 4 (retour de Claude) et 5 : import de la réponse, CR éditable, exports, nouvelle réunion.

async function importResponse() {
  const text = $("response").value;
  if (!text.trim()) return alert("Colle d'abord la réponse de Claude.");
  if (state.cr && !confirm("Remplacer le compte rendu actuel (et tes corrections) par cette réponse ?")) return;
  let cr;
  try {
    cr = restoreNamesIn(normalizeCR(extractJson(text)), state.anon);
  } catch (err) {
    return alert(`Import impossible : ${err.message}`);
  }
  showCR(cr);
  saveDraft();
  // Le presse-papiers contient la réponse de Claude ; il peut être partagé avec l'iPhone (Handoff).
  let cleared = false;
  try {
    await navigator.clipboard.writeText("");
    cleared = true;
  } catch { /* navigateur qui refuse : sans gravité */ }
  $("import-info").textContent = cleared ? "Réponse importée. Presse-papiers vidé." : "Réponse importée.";
  $("step-cr").scrollIntoView({ behavior: "smooth" });
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
const FLAGGED = { actions: ["responsable", "delai"], deliberations: ["pour", "contre", "abstention"] };
const isTbd = (v) => /à définir|^\s*\?\s*$/i.test(v) || v.trim() === "";

function editor(value, onInput, type, flag = false) {
  let input;
  if (Array.isArray(type)) {
    input = el("select", {}, type.map((o) => el("option", { text: o })));
    if (value && !type.includes(value)) input.append(el("option", { text: value }));
    input.value = value || type[type.length - 1];
  } else if (type === "area") {
    input = el("textarea", { rows: 2, value: value ?? "" });
    requestAnimationFrame(() => autoGrow(input));
  } else {
    input = el("input", { class: type === "short" ? "short" : null, value: value ?? "" });
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
  const cr = state.cr;
  const head = el("div", { class: "grid" }, FIELDS.map(([k, label]) => el("label", { text: label }, editor(cr[k], (v) => (cr[k] = v)))));
  root.replaceChildren(
    head,
    renderTable("points_sensibles"),
    renderTable("participants"),
    renderList("absents_excuses"),
    renderList("invites"),
    renderList("ordre_du_jour"),
    renderTable("points"),
    renderTable("deliberations"),
    renderTable("actions"),
    renderList("points_ouverts"),
    renderTable("points_a_verifier"),
    el("label", { text: "Prochaine réunion" }, editor(cr.prochaine_reunion, (v) => (cr.prochaine_reunion = v))),
  );
  const sensibles = cr.points_sensibles.length;
  $("cr-warn").textContent = sensibles
    ? `Brouillon : ${sensibles} point(s) sensible(s) à arbitrer avant diffusion (voir en haut). Vérifie aussi les votes, décisions, responsables et délais.`
    : "Brouillon : vérifie les votes, décisions, responsables et délais avant d'envoyer au secrétaire.";
}

function renderTable(key) {
  const { title, cols } = TABLES[key];
  const rows = (state.cr[key] ||= []);
  const tbody = el("tbody", {}, rows.map((row, i) => el("tr", {}, [
    ...cols.map(([field, , type]) => el("td", {}, editor(row[field], (v) => (row[field] = v), type, FLAGGED[key]?.includes(field)))),
    el("td", {}, el("button", { class: "icon-btn danger", type: "button", title: "Supprimer", text: "✕", onclick: () => { rows.splice(i, 1); saveDraft(); renderCR(); } })),
  ])));
  const table = el("table", {}, [el("thead", {}, el("tr", {}, [...cols.map(([, l]) => el("th", { text: l })), el("th")])), tbody]);
  const add = el("button", {
    class: "icon-btn", type: "button", text: "+ Ajouter une ligne",
    onclick: () => {
      rows.push(Object.fromEntries(cols.map(([f, , t]) => [f, Array.isArray(t) ? t[t.length - 1] : FLAGGED.actions.includes(f) && key === "actions" ? "À définir" : ""])));
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
  return el("div", { class: "cr-section" }, [
    el("h3", { text: `${LISTS[key]} (${items.length})` }),
    ...items.map((item, i) => el("div", { class: "list-item" }, [
      editor(item, (v) => (items[i] = v), "area"),
      el("button", { class: "icon-btn danger", type: "button", text: "✕", onclick: () => { items.splice(i, 1); saveDraft(); renderCR(); } }),
    ])),
    el("button", { class: "icon-btn", type: "button", text: "+ Ajouter", onclick: () => { items.push(""); saveDraft(); renderCR(); } }),
  ]);
}

function showCR(cr) {
  state.cr = normalizeCR(cr);
  $("step-cr").hidden = false;
  renderCR();
}

// ---------------------------------------------------------------------------
// Exports et nouvelle réunion
// ---------------------------------------------------------------------------
async function guardedExport(fn, label) {
  const n = state.cr.points_sensibles.length;
  if (n && !confirm(`${n} point(s) sensible(s) sont signalés. As-tu vérifié que le CR peut être diffusé tel quel ?`)) return;
  $("export-info").textContent = `Préparation ${label}…`;
  try {
    await fn();
    $("export-info").textContent = "";
  } catch (err) {
    $("export-info").textContent = "";
    alert(`Échec de l'export : ${err.message}`);
  }
}

function resetAll() {
  if (!confirm("Effacer la réunion en cours (transcription, intervenants, passages retirés, réponse et CR) ?\nSont conservés : noms à anonymiser, corrections, éléments ignorés, participants habituels.")) return;
  for (const f of ["titre", "lieu", "consignes"]) $(`m-${f}`).value = "";
  $("response").value = "";
  Object.assign(state, { transcript: "", speakers: {}, exclusions: [], exclCounter: 0, cr: null });
  saveDraft();
  vault.flush().then(() => location.reload());
}

function bindCR() {
  $("btn-import").addEventListener("click", importResponse);
  $("response").addEventListener("input", saveDraft);
  $("btn-word").addEventListener("click", () => guardedExport(() => exportWord(state.cr, { inclureVerifs: $("opt-verifs").checked }), "du Word"));
  $("btn-excel").addEventListener("click", () => guardedExport(() => exportExcel(state.cr), "de l'Excel"));
  $("btn-reset").addEventListener("click", resetAll);
}
