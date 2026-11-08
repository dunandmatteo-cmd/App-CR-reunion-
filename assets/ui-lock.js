"use strict";
// Coffre : création, déverrouillage, verrouillage automatique, changement de mot de passe,
// sauvegarde chiffrée exportable. Démarrage de l'app.

const MIN_PASSWORD = 10;

function checkNewPassword(p1, p2) {
  if (p1.length < MIN_PASSWORD) throw new Error(`${MIN_PASSWORD} caractères minimum (une phrase courte est idéale).`);
  if (p1 !== p2) throw new Error("Les deux mots de passe sont différents.");
}

function showLock(mode, message = "") {
  const creating = mode === "create";
  $("lock").hidden = false;
  $("app").hidden = true;
  $("lock-form").hidden = false;
  $("lock-title").textContent = creating ? "Créer le mot de passe du coffre" : "Coffre verrouillé";
  $("lock-text").textContent = creating
    ? "Tes brouillons (transcription, vrais noms, CR) seront chiffrés sur ce Mac avec ce mot de passe. Il n'est enregistré nulle part : s'il est perdu, les brouillons sont irrécupérables."
    : "Saisis ton mot de passe pour déchiffrer le brouillon.";
  $("lock-confirm-row").hidden = !creating;
  $("lock-forgot").hidden = creating;
  $("lock-submit").textContent = creating ? "Créer et ouvrir" : "Déverrouiller";
  $("lock-error").textContent = message;
  $("lock-pass").value = "";
  $("lock-pass2").value = "";
  $("lock-pass").focus();
  $("lock-form").dataset.mode = mode;
}

async function submitLock(e) {
  e.preventDefault();
  const creating = $("lock-form").dataset.mode === "create";
  const pass = $("lock-pass").value;
  $("lock-error").textContent = "";
  $("lock-submit").disabled = true;
  try {
    if (creating) checkNewPassword(pass, $("lock-pass2").value);
    const data = creating ? await vault.create(pass) : await vault.unlock(pass);
    $("lock").hidden = true;
    $("app").hidden = false;
    startApp(data);
  } catch (err) {
    $("lock-error").textContent = err.message;
  } finally {
    $("lock-submit").disabled = false;
  }
}

function forgotPassword() {
  if (!confirm("Sans le mot de passe, le brouillon chiffré est irrécupérable. Tout effacer et recommencer ?")) return;
  vault.destroy();
  showLock("create");
}

async function restoreBackup(file) {
  try {
    const text = await file.text();
    if (vault.exists() && !confirm("Remplacer le coffre actuel par cette sauvegarde ? Le brouillon actuel sera perdu.")) return;
    vault.importBackup(text);
    showLock("unlock", "Sauvegarde restaurée : saisis le mot de passe qui protégeait cette sauvegarde.");
  } catch (err) {
    $("lock-error").textContent = err.message;
  } finally {
    $("lock-restore").value = "";
  }
}

async function exportBackup() {
  const content = await vault.exportBackup();
  if (!content) return alert("Rien à sauvegarder pour l'instant.");
  const day = new Date().toISOString().slice(0, 10);
  downloadBlob(new Blob([content], { type: "application/json" }), `sauvegarde-cr-${day}.json`);
}

async function lockNow() {
  await vault.flush();
  vault.lock();
  location.reload(); // vide la mémoire de la page
}

function setupAutoLock() {
  let t;
  const arm = () => {
    clearTimeout(t);
    t = setTimeout(lockNow, AUTO_LOCK_MIN * 60 * 1000);
  };
  for (const ev of ["pointerdown", "keydown", "scroll"]) window.addEventListener(ev, arm, { passive: true });
  arm();
}

// Changement de mot de passe : formulaire à champs masqués (plus de boîte de dialogue en clair).
function togglePasswordForm(open) {
  $("pw-form").hidden = !open;
  $("pw-error").textContent = "";
  $("pw-new").value = "";
  $("pw-new2").value = "";
  if (open) $("pw-new").focus();
}

async function submitPasswordChange(e) {
  e.preventDefault();
  try {
    checkNewPassword($("pw-new").value, $("pw-new2").value);
    await vault.flush();
    await vault.changePassword($("pw-new").value, draftData());
    togglePasswordForm(false);
    $("toolbar-info").textContent = "Mot de passe modifié. Pense à refaire une sauvegarde : les anciennes gardent l'ancien mot de passe.";
  } catch (err) {
    $("pw-error").textContent = err.message;
  }
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
let started = false;
function startApp(data) {
  if (started) return;
  started = true;
  $("m-date").value = new Date().toISOString().slice(0, 10);
  applyDraft(data);
  renderAnon();
  renderCorrections();
  refreshPrepare();
  updateInfosNow();
  setupAutoLock();
  vault.onStatus = (err) => {
    $("save-error").hidden = !err;
    if (err) $("save-error").textContent = `⚠ Brouillon NON sauvegardé (${err.message}). Ne verrouille pas et ne ferme pas la page : exporte d'abord le Word.`;
  };

  for (const f of META_FIELDS) $(`m-${f}`).addEventListener("input", () => { updateInfos(); saveDraft(); });
  bindPrepare();
  bindCR();
  $("btn-lock").addEventListener("click", lockNow);
  $("btn-password").addEventListener("click", () => togglePasswordForm($("pw-form").hidden));
  $("pw-cancel").addEventListener("click", () => togglePasswordForm(false));
  $("pw-form").addEventListener("submit", submitPasswordChange);
  $("btn-backup").addEventListener("click", exportBackup);
  window.addEventListener("pagehide", () => vault.flush());
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && vault.flush());
}

function init() {
  $("lock-form").addEventListener("submit", submitLock);
  $("lock-forgot").addEventListener("click", forgotPassword);
  $("lock-restore").addEventListener("change", (e) => e.target.files?.[0] && restoreBackup(e.target.files[0]));
  if (!vault.supported()) {
    $("lock").hidden = false;
    $("app").hidden = true;
    $("lock-title").textContent = "Navigateur non compatible";
    $("lock-text").textContent = "Ce navigateur ne permet pas le chiffrement depuis un fichier local. Ouvre index.html avec Chrome.";
    $("lock-form").hidden = true;
    return;
  }
  showLock(vault.exists() ? "unlock" : "create");
}

init();
