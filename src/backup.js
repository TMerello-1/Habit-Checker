// Habit backup, locked with the recovery code. While a profile is signed in, app.js keeps a
// copy of the habits, their history and the friend nicknames on the friends server, so
// signing in with the code on a new phone brings them back, and every device signed in to
// the profile syncs through it (see sync.js). The copy is encrypted here
// before it leaves the device (AES-GCM, with a key derived from the code by HKDF), and the
// server keeps neither the code nor the key, so its database can't be read on its own.
// Pure apart from WebCrypto, so it is tested under Node.

import { exportData, parseImport } from './transfer.js';

const BACKUP_SALT = 'habit-checker backup v1';

async function backupKey(code) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(code), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(BACKUP_SALT), info: new Uint8Array() },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const isMap = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// The text the backup holds: the "Move your data" export plus the sync stamps (sync.js)
// and the nicknames.
export function backupText(state, nicknames = {}) {
  return JSON.stringify({ ...JSON.parse(exportData(state)), sync: state.sync || {}, nicknames });
}

// `code` is the normalized recovery code. Returns base64 of the IV followed by the ciphertext.
export async function encryptBackup(code, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await backupKey(code), new TextEncoder().encode(text));
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), iv.length);
  return toBase64(out);
}

// Returns { version, habits, completions, sync, nicknames }. Throws if the code doesn't open it or the
// contents are damaged.
export async function decryptBackup(code, data) {
  const bytes = fromBase64(data);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, await backupKey(code), bytes.subarray(12));
  const text = new TextDecoder().decode(plain);
  const { nicknames, sync } = JSON.parse(text);
  return { version: 1, ...parseImport(text), sync: isMap(sync) ? sync : {}, nicknames: isMap(nicknames) ? nicknames : {} };
}
