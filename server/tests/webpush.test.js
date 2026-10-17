import assert from 'node:assert/strict';
import { test } from 'node:test';
import { b64url, encryptPayload, fromB64url, generateVapidJwk, vapidAuthorization, vapidPublicKey } from '../src/webpush.js';

// Builds a P-256 JWK from a raw private scalar and its uncompressed public point.
function jwkFrom(d, publicKey) {
  const pub = fromB64url(publicKey);
  return { kty: 'EC', crv: 'P-256', d, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33)) };
}

// RFC 8291 Appendix A example.
const rfc = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  message:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('encryption matches the RFC 8291 example byte for byte', async () => {
  const curve = { name: 'ECDH', namedCurve: 'P-256' };
  const serverKeys = {
    privateKey: await crypto.subtle.importKey('jwk', jwkFrom(rfc.asPrivate, rfc.asPublic), curve, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', fromB64url(rfc.asPublic), curve, true, []),
  };
  const out = await encryptPayload({ keys: { p256dh: rfc.uaPublic, auth: rfc.auth } }, rfc.plaintext, {
    salt: fromB64url(rfc.salt),
    serverKeys,
  });
  assert.equal(b64url(out), rfc.message);
});

test('VAPID header carries a JWT that verifies against the public key', async () => {
  const jwk = await generateVapidJwk();
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', jwk, 'https://example.com/', 0);
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, vapidPublicKey(jwk));
  assert.equal(fromB64url(k).length, 65);

  const [h, c, sig] = token.split('.');
  const claims = JSON.parse(new TextDecoder().decode(fromB64url(c)));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: 12 * 3600, sub: 'https://example.com/' });

  const pub = await crypto.subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(sig), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok);
});
