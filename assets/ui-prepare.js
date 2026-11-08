"use strict";
// Étapes 2 à 4 : transcription, corrections, intervenants, passages retirés,
// pseudonymisation, détection des restes, rapport et copie pour Claude.ai.

// ---------------------------------------------------------------------------
// Import de la transcription
// ---------------------------------------------------------------------------
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, head").forEach((n) => n.remove());
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const blocks = [...doc.body.querySelectorAll("p, li, h1, h2, h3, h4, div")].filter((b) => !b.querySelector("p, li, div"));
  return (blocks.length ? blocks : [doc.body])
    .flatMap((b) => b.textContent.split("\n"))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function importFile(file) {
  const raw = await file.text();
  const name = file.name.toLowerCase();
  let text = raw;
  if (name.endsWith(".html") || name.endsWith(".htm") || /^\s*<(!doctype|html)/i.test(raw)) text = htmlToText(raw);
  else if (name.endsWith(".vtt") || /^WEBVTT/.test(raw)) text = vttToText(raw);
  const fixed = applyCorrectionsTo(text, state.corrections);
  state.speakers = {};
  state.exclusions = [];
  setTranscript(fixed.text);
  $("corr-info").textContent = fixed.count ? `${fixed.count} correction(s) appliquée(s) automatiquement à l'import.` : "";
}

function setTranscript(text) {
  state.transcript = text;
  $("transcript").value = text;
  refreshPrepare();
  saveDraft();
}

function refreshPrepare() {
  renderSpeakers();
  renderExclusions();
  updateInfos();
}

// ---------------------------------------------------------------------------
// Dictionnaire de corrections (conservé d'une réunion à l'autre)
// ---------------------------------------------------------------------------
function renderCorrections() {
  const tbody = $("corr-table").querySelector("tbody");
  tbody.replaceChildren();
  state.corrections.forEach((c, i) => {
    const de = el("input", { value: c.de, placeholder: "Ex. Sénode", "aria-label": "Texte mal transcrit" });
    de.addEventListener("input", () => { c.de = de.value; saveDraft(); });
    const vers = el("input", { value: c.vers, placeholder: "Ex. Seynod", "aria-label": "Correction" });
    vers.addEventListener("input", () => { c.vers = vers.value; saveDraft(); });
    const del = el("button", {
      class: "icon-btn danger", type: "button", text: "✕", title: "Supprimer",
      onclick: () => { state.corrections.splice(i, 1); renderCorrections(); saveDraft(); },
    });
    tbody.append(el("tr", {}, [el("td", {}, de), el("td", {}, vers), el("td", {}, del)]));
  });
  $("corr-count").textContent = String(state.corrections.length);
}

function applyCorrectionsNow() {
  const r = applyCorrectionsTo(state.transcript, state.corrections);
  $("corr-info").textContent = r.count ? `${r.count} correction(s) appliquée(s).` : "Aucune occurrence à corriger.";
  if (r.count) setTranscript(r.text);
}

// ---------------------------------------------------------------------------
// Intervenants : S01 → nom (ensuite pseudonymisé avant l'envoi)
// ---------------------------------------------------------------------------
function renderSpeakers() {
  const list = detectSpeakers(state.transcript);
  const box = $("speakers");
  $("speakers-panel").hidden = list.length === 0;
  box.replaceChildren();
  updateParticipantsList();
  for (const sp of list) {
    const input = el("input", { value: state.speakers[sp.label] || "", list: "participants-list", placeholder: "Qui est-ce ?", "aria-label": `Nom de ${sp.label}` });
    input.addEventListener("change", () => {
      const name = input.value.trim();
      state.speakers[sp.label] = name;
      // Le nom ne doit jamais partir en clair : on l'ajoute à la table d'anonymisation.
      if (name && !state.anon.some((a) => sameName(a.nom, name))) {
        addAnon(name, participantNames().some((p) => sameName(p, name)));
      } else {
        updateInfos();
        saveDraft();
      }
    });
    box.append(el("div", { class: "speaker" }, [
      el("span", { class: "chip type", text: sp.label }),
      el("span", { class: "speaker-stats", text: `${sp.count} réplique${sp.count > 1 ? "s" : ""} · ${sp.words} mots` }),
      input,
      el("span", { class: "speaker-sample", text: sp.sample ? `« ${sp.sample} »` : "" }),
    ]));
  }
}

// Suggestions de noms : mises à jour sans redessiner les champs en cours de saisie.
function updateParticipantsList() {
  $("participants-list").replaceChildren(...participantNames().map((n) => el("option", { value: n })));
}

// ---------------------------------------------------------------------------
// Passages retirés
// ---------------------------------------------------------------------------
function excludeSelection() {
  const t = $("transcript");
  const { selectionStart: a, selectionEnd: b } = t;
  const sel = t.value.slice(a, b);
  if (sel.trim().length < 3) {
    $("excl-info").textContent = "Sélectionne d'abord, dans la transcription ci-dessus, le passage à retirer.";
    return;
  }
  if (/⟦Passage retiré n°\d+⟧/.test(sel)) {
    $("excl-info").textContent = "La sélection contient déjà un passage retiré : sélectionne un autre passage.";
    return;
  }
  const n = ++state.exclCounter;
  state.exclusions.push({ n, texte: sel });
  state.transcript = t.value.slice(0, a) + exclMarker(n) + t.value.slice(b);
  t.value = state.transcript;
  $("excl-info").textContent = `Passage n°${n} retiré : il ne partira pas.`;
  refreshPrepare();
  saveDraft();
}

function restoreExclusion(ex) {
  const marker = exclMarker(ex.n);
  if (state.transcript.includes(marker)) {
    state.transcript = state.transcript.split(marker).join(ex.texte);
    $("transcript").value = state.transcript;
  }
  state.exclusions = state.exclusions.filter((x) => x !== ex);
  refreshPrepare();
  saveDraft();
}

function renderExclusions() {
  const box = $("excl-list");
  box.replaceChildren();
  const missing = new Set(applyExclusionsTo(state.transcript, state.exclusions).missing);
  for (const ex of state.exclusions) {
    const preview = ex.texte.replace(/\s+/g, " ").trim();
    const gone = missing.has(ex.n);
    box.append(el("div", { class: `excl-item${gone ? " missing" : ""}` }, [
      el("span", { class: "chip", text: `n°${ex.n}` }),
      el("span", { class: "excl-text", text: preview.length > 140 ? `${preview.slice(0, 140)}…` : preview }),
      gone ? el("span", { class: "chip", text: "repère effacé de la transcription" }) : null,
      el("button", { class: "icon-btn", type: "button", text: gone ? "Oublier" : "Remettre dans la transcription", onclick: () => restoreExclusion(ex) }),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Table d'anonymisation
// ---------------------------------------------------------------------------
function renderAnon() {
  const tbody = $("anon-table").querySelector("tbody");
  tbody.replaceChildren();
  state.anon.forEach((a, i) => {
    const nom = el("input", { value: a.nom, placeholder: "Ex. Léa Martin", "aria-label": "Nom" });
    nom.addEventListener("input", () => { a.nom = nom.value; updateInfos(); saveDraft(); });
    const pseudo = el("input", { value: a.pseudo, "aria-label": "Pseudonyme" });
    pseudo.addEventListener("input", () => { a.pseudo = pseudo.value; updateInfos(); saveDraft(); });
    const chk = el("input", { type: "checkbox", "aria-label": "Rétablir dans le CR" });
    chk.checked = Boolean(a.restaurer);
    chk.addEventListener("change", () => { a.restaurer = chk.checked; saveDraft(); });
    const del = el("button", {
      class: "icon-btn danger", type: "button", text: "✕", title: "Supprimer",
      onclick: () => { state.anon.splice(i, 1); renderAnon(); updateInfos(); saveDraft(); },
    });
    tbody.append(el("tr", {}, [el("td", {}, nom), el("td", {}, pseudo), el("td", { class: "center" }, chk), el("td", {}, del)]));
  });
}

function addAnon(nom = "", restaurer = false, pseudo = null) {
  if (nom && state.anon.some((a) => sameName(a.nom, nom))) return;
  state.anon.push({ nom, pseudo: pseudo || nextPseudo(state.anon), restaurer });
  renderAnon();
  updateInfos();
  saveDraft();
}

function addParticipants() {
  const names = participantNames();
  if (!names.length) {
    $("anon-info").textContent = "Aucun participant saisi à l'étape 1.";
    return;
  }
  for (const nom of names) {
    addAnon(nom, true);
    const prenom = nom.split(/\s+/)[0];
    if (prenom && prenom !== nom) addAnon(prenom, true);
  }
}

// ---------------------------------------------------------------------------
// Texte envoyé : intervenants → passages retirés → pseudonymisation → détection
// ---------------------------------------------------------------------------
function buildOutgoing() {
  const withSpeakers = applySpeakersTo(state.transcript, state.speakers);
  const ex = applyExclusionsTo(withSpeakers, state.exclusions);
  const an = anonymizeText(ex.text, state.anon);
  const meta = getMeta();
  let metaCount = 0;
  for (const k of ["titre", "lieu", "president", "secretaire", "participants", "consignes"]) {
    const r = anonymizeText(meta[k] || "", state.anon);
    meta[k] = r.text;
    metaCount += r.count;
  }
  const scanText = [an.text, meta.titre, meta.lieu, meta.president, meta.secretaire, meta.participants, meta.consignes].join("\n");
  return {
    prompt: buildPrompt(an.text, meta),
    replacements: an.count + metaCount,
    exclusions: ex,
    detections: detectSensitive(scanText, state.ignore),
    words: wordCount(an.text),
  };
}

let infoTimer = null;
function updateInfos() {
  clearTimeout(infoTimer);
  infoTimer = setTimeout(updateInfosNow, 250);
}

function updateInfosNow() {
  clearTimeout(infoTimer);
  const words = wordCount(state.transcript);
  $("transcript-info").textContent = words ? `${words.toLocaleString("fr-FR")} mots` : "";
  const out = buildOutgoing();
  $("anon-info").textContent = state.anon.length ? `${out.replacements} remplacement(s) dans la transcription et les informations.` : "";
  if ($("preview-details").open) $("prompt-preview").value = out.prompt;
  renderDetections(out.detections);
  renderReport(out, words);
}

// ---------------------------------------------------------------------------
// Détection automatique (étape 3)
// ---------------------------------------------------------------------------
function pseudoForType(type) {
  const base = DETECT_TYPES[type].pseudo.slice(1, -1);
  const used = new Set(state.anon.map((a) => a.pseudo));
  for (let i = 1; i < 1000; i++) {
    const p = i === 1 ? `[${base}]` : `[${base} ${i}]`;
    if (!used.has(p)) return p;
  }
  return `[${base}]`;
}

function renderDetections(list) {
  const box = $("detect-list");
  const badge = $("detect-count");
  box.replaceChildren();
  if (!state.transcript.trim()) {
    badge.textContent = "En attente de la transcription";
    badge.className = "chip";
    return;
  }
  badge.textContent = list.length ? `${list.length} élément(s) à examiner` : "Rien de détecté";
  badge.className = `chip ${list.length ? "warn" : "ok"}`;
  for (const d of list) {
    const isName = d.type === "nom" || d.type === "nom_debut";
    box.append(el("div", { class: "detect-item" }, [
      el("span", { class: `chip type${d.type === "nom_debut" ? " soft" : ""}`, text: DETECT_TYPES[d.type].label }),
      el("span", { class: "detect-value", text: d.value }),
      el("span", { class: "detect-n", text: `×${d.count}` }),
      el("span", { class: "detect-actions" }, [
        el("button", { class: "icon-btn", type: "button", text: "Anonymiser", onclick: () => addAnon(d.value, false, isName ? null : pseudoForType(d.type)) }),
        el("button", { class: "icon-btn", type: "button", text: "Ignorer", onclick: () => { state.ignore.push(d.value); updateInfos(); saveDraft(); } }),
      ]),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Rapport avant envoi et copie (étape 4)
// ---------------------------------------------------------------------------
function renderReport(out, words) {
  const byType = {};
  for (const d of out.detections) byType[d.type] = (byType[d.type] || 0) + 1;
  const alerts = out.detections.length;
  const noAnon = !state.anon.some((a) => a.nom.trim());
  const named = Object.values(state.speakers).filter((v) => v && v.trim()).length;
  const rows = [
    ["Mots envoyés", words ? out.words.toLocaleString("fr-FR") : "—", ""],
    ["Intervenants identifiés", named ? String(named) : "aucun", ""],
    ["Remplacements (noms, numéros…)", String(out.replacements), noAnon ? "warn" : "ok"],
    ["Passages retirés", out.exclusions.applied ? `${out.exclusions.applied} (${out.exclusions.words} mots)` : "0", ""],
    ["Données identifiantes restantes",
      alerts ? Object.entries(byType).map(([t, n]) => `${n} × ${DETECT_TYPES[t].label.toLowerCase()}`).join(", ") : "aucune détectée",
      alerts ? "warn" : "ok"],
  ];
  $("report-body").replaceChildren(...rows.map(([k, v, cls]) => el("tr", {}, [el("th", { text: k }), el("td", { class: cls, text: v })])));

  const needAck = Boolean(words) && (alerts > 0 || noAnon);
  $("report-ack-row").hidden = !needAck;
  if (!needAck) $("report-ack").checked = false;
  $("report-ack-label").textContent = noAnon
    ? "Aucun nom n'est anonymisé : j'accepte d'envoyer la transcription telle quelle."
    : "J'ai examiné les alertes restantes et j'accepte d'envoyer ce texte.";
  $("btn-copy-prompt").disabled = !(words && (!needAck || $("report-ack").checked));
  $("prompt-info").textContent = words ? `≈ ${Math.round(out.prompt.length / 1000)} k caractères` : "Importe d'abord la transcription (étape 2).";
}

async function copyPrompt() {
  const { prompt } = buildOutgoing();
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    const t = $("prompt-preview");
    $("preview-details").open = true;
    t.value = prompt;
    t.select();
    document.execCommand("copy");
  }
  $("prompt-info").textContent = "Copié ✔ : colle-le dans Claude.ai";
}

function bindPrepare() {
  $("file").addEventListener("change", (e) => e.target.files?.[0] && importFile(e.target.files[0]));
  $("transcript").addEventListener("input", () => {
    state.transcript = $("transcript").value;
    renderExclusions();
    clearTimeout(bindPrepare.speakerTimer);
    bindPrepare.speakerTimer = setTimeout(renderSpeakers, 600);
    updateInfos();
    saveDraft();
  });
  $("btn-corr-add").addEventListener("click", () => { state.corrections.push({ de: "", vers: "" }); renderCorrections(); saveDraft(); });
  $("btn-corr-apply").addEventListener("click", applyCorrectionsNow);
  $("btn-exclude").addEventListener("click", excludeSelection);
  $("btn-anon-add").addEventListener("click", () => addAnon());
  $("btn-anon-participants").addEventListener("click", addParticipants);
  $("btn-ignore-reset").addEventListener("click", () => { state.ignore = []; updateInfos(); saveDraft(); });
  $("report-ack").addEventListener("change", updateInfosNow);
  $("preview-details").addEventListener("toggle", updateInfosNow);
  $("btn-copy-prompt").addEventListener("click", copyPrompt);
  $("m-participants").addEventListener("input", updateParticipantsList);
}
