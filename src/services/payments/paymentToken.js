const crypto = require('node:crypto');

const TOKEN_RE = /^([0-9a-f-]{36})\.(\d{10,13})\.([A-Za-z0-9_-]{43})$/;

function sign(secret, orderId, exp) {
  return crypto.createHmac('sha256', secret).update(`pay:${orderId}.${exp}`).digest('base64url');
}

function createPaymentToken(secret, orderId, expiresAtMs) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('PAYMENT_LINK_SECRET must have at least 32 characters');
  const exp = Math.floor(expiresAtMs);
  return `${orderId}.${exp}.${sign(secret, orderId, exp)}`;
}

/** @returns {{ok: true, orderId: string} | {ok: false, reason: 'format'|'signature'|'expired'}} */
function verifyPaymentToken(secret, token, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || typeof token !== 'string') return { ok: false, reason: 'format' };
  const match = TOKEN_RE.exec(token);
  if (!match) return { ok: false, reason: 'format' };
  const [, orderId, expRaw, sig] = match;
  const expected = Buffer.from(sign(secret, orderId, Number(expRaw)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, reason: 'signature' };
  if (Number(expRaw) <= now) return { ok: false, reason: 'expired' };
  return { ok: true, orderId };
}

module.exports = { createPaymentToken, verifyPaymentToken };
