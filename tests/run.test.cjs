"use strict";
// Tests automatiques de la logique de l'app (sans navigateur).
// Lancer depuis le dossier de l'app :  node --test tests/
// Nécessite Node.js 20 ou plus récent. Aucune dépendance à installer.

const test = require("node:test");
const assert = require("node:assert/strict");

// Stockage du navigateur simulé pour le coffre.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const L = require("../assets/logic.js");
const { detectSensitive } = require("../assets/detect.js");
const { buildPrompt, extractJson, normalizeCR } = require("../assets/prompt.js");
const { vault } = require("../assets/vault.js");

// Transcription d'environ 2 h (≈ 20 000 mots), au format noScribe.
const LONG = Array.from({ length: 2400 }, (_, i) =>
  `[${String(Math.floor(i / 20)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00] S0${(i % 8) + 1}: On parle du budget du gala, des créneaux de la piscine et des compétitions régionales, point ${i}.`
).join("\n");

test("pseudonymisation : accents, casse, tirets et mots entiers", () => {
  const rules = [
    { nom: "Léa Martin", pseudo: "[Personne A]" },
    { nom: "Léa", pseudo: "[Personne B]" },
    { nom: "Jean-Pierre", pseudo: "[Personne C]" },
  ];
  const r = L.anonymizeText("Lea Martin et LÉA sont là. Jean Pierre aussi. Léandre non. Léa’s ok.", rules);
  assert.equal(r.text, "[Personne A] et [Personne B] sont là. [Personne C] aussi. Léandre non. [Personne B]’s ok.");
  assert.equal(r.count, 4);
});

test("rétablissement des noms : seulement les règles cochées", () => {
  const rules = [
    { nom: "Marc Dupont", pseudo: "[Personne A]", restaurer: true },
    { nom: "Chloé", pseudo: "[Personne B]", restaurer: false },
  ];
  const cr = { actions: [{ responsable: "[Personne A]", action: "Prévenir les parents de [Personne B]" }] };
  const out = L.restoreNamesIn(cr, rules);
  assert.equal(out.actions[0].responsable, "Marc Dupont");
  assert.equal(out.actions[0].action, "Prévenir les parents de [Personne B]");
  // « [Personne A] » ne doit pas toucher « [Personne AB] »
  assert.equal(L.restoreNamesIn("[Personne AB]", rules), "[Personne AB]");
});

test("pseudonymes : lettres uniques, puis AA, AB…", () => {
  const used = [];
  for (let i = 0; i < 28; i++) used.push({ pseudo: L.nextPseudo(used) });
  assert.equal(used[0].pseudo, "[Personne A]");
  assert.equal(used[25].pseudo, "[Personne Z]");
  assert.equal(used[26].pseudo, "[Personne AA]");
  assert.equal(new Set(used.map((u) => u.pseudo)).size, 28);
});

test("passages retirés : remplacés, jamais envoyés, même si le reste change", () => {
  const ex = [{ n: 1, texte: "Kevin a été exclu du stage" }];
  const text = `Début. ${L.exclMarker(1)} Suite modifiée.`;
  const r = L.applyExclusionsTo(text, ex);
  assert.ok(r.text.includes("[Passage retiré n°1 : à rédiger manuellement]"));
  assert.ok(!r.text.includes("Kevin"));
  assert.equal(r.applied, 1);
  // repère orphelin : remplacé quand même
  assert.ok(!L.applyExclusionsTo("x ⟦Passage retiré n°9⟧ y", []).text.includes("⟦"));
});

test("corrections : insensibles aux accents, les plus longues d'abord", () => {
  const r = L.applyCorrectionsTo("Réunion à Sénode et senode, avec Léa Martain.", [
    { de: "Sénode", vers: "Seynod" },
    { de: "Léa Martain", vers: "Léa Martin" },
    { de: "Martain", vers: "X" },
  ]);
  assert.equal(r.text, "Réunion à Seynod et Seynod, avec Léa Martin.");
  assert.equal(r.count, 3);
});

test("intervenants : détection et remplacement des étiquettes", () => {
  const t = "[00:00:01] S01: Bonjour à tous, on commence.\n[00:00:05] S02: Merci, premier point du jour.\nS01: Deuxième réplique ici.";
  const sp = L.detectSpeakers(t);
  assert.deepEqual(sp.map((s) => [s.label, s.count]), [["S01", 2], ["S02", 1]]);
  const out = L.applySpeakersTo(t, { S01: "Marc Dupont" });
  assert.ok(out.startsWith("[00:00:01] Marc Dupont : Bonjour"));
  assert.ok(out.includes("S02: Merci"));
  assert.ok(out.includes("\nMarc Dupont : Deuxième"));
});

test("intervenant nommé puis pseudonymisé : le nom ne part pas", () => {
  const t = "S03: Je m'occupe de la salle.";
  const withNames = L.applySpeakersTo(t, { S03: "Sophie Bernard" });
  const out = L.anonymizeText(withNames, [{ nom: "Sophie Bernard", pseudo: "[Personne C]" }]);
  assert.equal(out.text, "[Personne C] : Je m'occupe de la salle.");
});

test("détection : coordonnées, noms en milieu et en début de réplique", () => {
  const t = [
    "S01: Bonjour, on commence. Merci Marc.",
    "S02: Kevin, tu peux nous dire où en est le stage ?",
    "S03: Sa maman a laissé le 06 12 34 56 78 et chloe.lefevre@gmail.com.",
    "S01: Elle est née le 3 mars 2014, licence n° 2014ABC123, 12 rue des Fleurs.",
  ].join("\n");
  const found = detectSensitive(t, []);
  const has = (type, value) => found.some((d) => d.type === type && d.value === value);
  assert.ok(has("nom", "Marc"));
  assert.ok(has("nom_debut", "Kevin"));
  assert.ok(has("telephone", "06 12 34 56 78"));
  assert.ok(has("email", "chloe.lefevre@gmail.com"));
  assert.ok(has("naissance", "née le 3 mars 2014"));
  assert.ok(has("numero", "2014ABC123"));
  assert.ok(has("adresse", "12 rue des Fleurs"));
  // mots courants en début de phrase : pas d'alerte
  assert.ok(!found.some((d) => ["Bonjour", "Sa", "Elle"].includes(d.value)));
  // pseudonymes et horodatages ignorés
  assert.equal(detectSensitive("[00:01:02] [Personne A] : [Téléphone] et [E-mail].", []).length, 0);
  // liste « Ignorer »
  assert.ok(!detectSensitive(t, ["Kevin"]).some((d) => d.value === "Kevin"));
});

test("chaîne complète sur 2 h : rapide et sans donnée réelle", () => {
  const t0 = Date.now();
  const text = L.applySpeakersTo(LONG + "\nS01: Merci Léa Martin.", { S01: "Marc Dupont" });
  const an = L.anonymizeText(text, [
    { nom: "Marc Dupont", pseudo: "[Personne A]" },
    { nom: "Léa Martin", pseudo: "[Personne B]" },
  ]);
  const det = detectSensitive(an.text, []);
  const ms = Date.now() - t0;
  assert.ok(!/Marc Dupont|Léa Martin/.test(an.text));
  assert.equal(det.filter((d) => d.type === "nom").length, 0);
  assert.ok(ms < 2000, `trop lent : ${ms} ms`);
});

test("consignes et lecture de la réponse de Claude", () => {
  const p = buildPrompt("S01: texte", { titre: "Bureau", participants: "" });
  assert.ok(p.includes("<transcription>\nS01: texte\n</transcription>"));
  const raw = "Voici :\n```json\n{\"titre\":\"T\",\"actions\":[{\"action\":\"A\",\"responsable\":\"\",\"priorite\":\"x\"}],\"points\":\"seul\"}\n```";
  const cr = normalizeCR(extractJson(raw));
  assert.equal(cr.actions[0].responsable, "À définir");
  assert.equal(cr.actions[0].priorite, "Non précisée");
  assert.deepEqual(cr.points, [{ sujet: "seul", resume: "" }]);
  assert.throws(() => extractJson("pas de json"), /Aucun objet JSON/);
});

test("import VTT", () => {
  const vtt = "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v S01>Bonjour à tous\n\nNOTE commentaire\n";
  assert.equal(L.vttToText(vtt), "S01 : Bonjour à tous");
});

test("coffre : chiffre, restaure 2 h de transcription, refuse un mauvais mot de passe", async () => {
  store.clear();
  const big = { transcript: LONG + LONG, anon: [{ nom: "Léa Martin", pseudo: "[Personne A]" }] };
  await vault.create("mot de passe du club");
  await vault.saveNow(big);
  const raw = store.get("cr-asso-coffre-v1");
  assert.ok(raw.length > 400000, "le contenu de test doit dépasser la taille qui faisait planter l'ancienne version");
  assert.ok(!raw.includes("Léa") && !raw.includes("budget"), "aucun texte en clair dans le stockage");
  vault.lock();
  await assert.rejects(() => vault.unlock("mauvais mot de passe"), /incorrect/);
  const back = await vault.unlock("mot de passe du club");
  assert.equal(back.transcript, big.transcript);
});

test("coffre : sauvegarde exportée puis restaurée", async () => {
  store.clear();
  await vault.create("mot de passe du club");
  await vault.saveNow({ transcript: "réunion de bureau" });
  const backup = await vault.exportBackup();
  vault.destroy();
  assert.equal(vault.exists(), false);
  assert.throws(() => vault.importBackup("{\"autre\":1}"), /pas une sauvegarde/);
  vault.importBackup(backup);
  const back = await vault.unlock("mot de passe du club");
  assert.equal(back.transcript, "réunion de bureau");
});
