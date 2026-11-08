"use strict";
// Coffre local : le brouillon (transcription, table des vrais noms, réponse, CR)
// est chiffré dans le navigateur avant d'être stocké.
//
// - Chiffrement : AES-GCM 256 bits (Web Crypto API du navigateur)
// - Clé : dérivée du mot de passe par PBKDF2-SHA-256, 600 000 itérations, sel aléatoire
// - Le mot de passe n'est jamais stocké ; la clé n'existe qu'en mémoire, le temps de la session
// - Mot de passe oublié = données irrécupérables (c'est voulu)
//
// Ce coffre protège les données stockées sur le Mac. Il ne change rien à ce qui
// est envoyé à Claude.ai : ce texte-là doit être lisible pour être traité.

const vault = (() => {
  const STORE = "cr-asso-coffre-v1";
  const LEGACY = "cr-asso-brouillon-v1"; // ancien brouillon non chiffré
  const ITERATIONS = 600000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let key = null;
  let salt = null;
  let pending = null;
  let timer = null;

  // Conversion par blocs : passer tout le tableau en arguments (String.fromCharCode(...octets))
  // dépasse la pile du navigateur au-delà d'environ 150 000 octets, soit une réunion d'1 h 30.
  const b64 = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  function read(name) {
    try { return localStorage.getItem(name); } catch { return null; }
  }
  function write(name, value) {
    try { localStorage.setItem(name, value); return true; } catch { return false; }
  }
  function remove(name) {
    try { localStorage.removeItem(name); } catch { /* ignore */ }
  }

  async function deriveKey(password, saltBytes, iterations = ITERATIONS) {
    const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations },
      base,
      { name: "AES-GCM", length: 256 },
      false, // clé non exportable
      ["encrypt", "decrypt"]
    );
  }

  async function encryptObject(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // IV neuf à chaque sauvegarde
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, kdf: "PBKDF2-SHA256", iter: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) });
  }

  return {
    supported: () => Boolean(window.crypto?.subtle && window.TextEncoder),
    exists: () => Boolean(read(STORE)),
    unlocked: () => Boolean(key),

    // Ancien brouillon en clair (version précédente de l'app), à migrer dans le coffre.
    legacy() {
      try { return JSON.parse(read(LEGACY) || "null"); } catch { return null; }
    },

    async create(password) {
      salt = crypto.getRandomValues(new Uint8Array(16));
      key = await deriveKey(password, salt);
      const legacy = this.legacy();
      await this.saveNow(legacy || {});
      remove(LEGACY); // plus aucune copie en clair
      return legacy || {};
    },

    async unlock(password) {
      const box = JSON.parse(read(STORE));
      const s = unb64(box.salt);
      const k = await deriveKey(password, s, box.iter || ITERATIONS);
      let plain;
      try {
        plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, k, unb64(box.data));
      } catch {
        throw new Error("Mot de passe incorrect.");
      }
      key = k;
      salt = s;
      remove(LEGACY);
      return JSON.parse(dec.decode(plain));
    },

    // Sauvegarde différée (regroupe les frappes au clavier).
    save(obj) {
      if (!key) return;
      pending = obj;
      clearTimeout(timer);
      timer = setTimeout(() => this.flush(), 600);
    },

    async flush() {
      clearTimeout(timer);
      if (!key || !pending) return;
      const obj = pending;
      pending = null;
      await this.saveNow(obj);
    },

    // Appelé quand une sauvegarde échoue (à brancher sur un message visible dans l'app).
    onStatus: null,

    async saveNow(obj) {
      if (!key) return;
      try {
        if (!write(STORE, await encryptObject(obj))) throw new Error("stockage du navigateur plein ou indisponible");
        this.onStatus?.(null);
      } catch (err) {
        console.error("Sauvegarde du brouillon impossible :", err);
        this.onStatus?.(err);
      }
    },

    async changePassword(newPassword, currentData) {
      salt = crypto.getRandomValues(new Uint8Array(16));
      key = await deriveKey(newPassword, salt);
      await this.saveNow(currentData);
    },

    lock() {
      key = null;
      salt = null;
      pending = null;
    },

    destroy() {
      remove(STORE);
      remove(LEGACY);
      this.lock();
    },
  };
})();
