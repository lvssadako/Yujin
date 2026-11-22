const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createPaymentToken, verifyPaymentToken } = require('../paymentToken');
const { createRateLimiter } = require('../rateLimiter');

const secret = 'x'.repeat(40);
const id = crypto.randomUUID();

test('token válido, manipulado, expirado y con secreto corto', () => {
  const now = Date.now();
  const token = createPaymentToken(secret, id, now + 60000);
  assert.deepEqual(verifyPaymentToken(secret, token, now), { ok: true, orderId: id });
  assert.equal(verifyPaymentToken('y'.repeat(40), token, now).reason, 'signature');
  assert.equal(verifyPaymentToken(secret, token.replace(/.$/, c => (c === 'A' ? 'B' : 'A')), now).reason, 'signature');
  assert.equal(verifyPaymentToken(secret, token, now + 120000).reason, 'expired');
  assert.equal(verifyPaymentToken(secret, 'basura', now).reason, 'format');
  assert.equal(verifyPaymentToken(secret, undefined, now).reason, 'format');
  assert.throws(() => createPaymentToken('corto', id, now));
  const other = createPaymentToken(secret, crypto.randomUUID(), now + 60000);
  assert.notEqual(other.split('.')[2], token.split('.')[2]);
});

test('limitador: bloquea al pasar el límite, expira la ventana y se limpia', () => {
  let clock = 1000;
  const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => clock });
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), false);
  assert.equal(limiter.allow('b'), true);
  clock += 1001;
  assert.equal(limiter.allow('a'), true);
  limiter.sweep();
  assert.equal(limiter.size(), 1);
  limiter.reset();
  assert.equal(limiter.size(), 0);
  limiter.stop();
});
