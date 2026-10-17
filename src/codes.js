// Recovery and invite codes, shared by the app and the friends server. Codes use Crockford's
// base32 (no I, L, O or U), so they are easy to read aloud and type, and typos like O for 0
// are corrected when they're typed back in.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const RECOVERY_LENGTH = 20; // 100 bits: the profile's secret
export const INVITE_LENGTH = 8; // 40 bits: short-lived, single use, and only readable when signed in

export function randomCode(length, getRandomValues = (a) => crypto.getRandomValues(a)) {
  return [...getRandomValues(new Uint8Array(length))].map((b) => ALPHABET[b & 31]).join('');
}

// Uppercases, drops spaces and dashes, and maps look-alike letters to their digits.
export function normalizeCode(text) {
  return String(text)
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isCode(code, length) {
  return code.length === length && [...code].every((c) => ALPHABET.includes(c));
}

// "ABCD1234" → "ABCD-1234", in groups of four for invites and five for recovery codes.
export function formatCode(code) {
  const size = code.length === RECOVERY_LENGTH ? 5 : 4;
  return code.match(new RegExp(`.{1,${size}}`, 'g')).join('-');
}
