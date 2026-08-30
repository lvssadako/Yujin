const test = require('node:test');
const assert = require('node:assert/strict');
const { RateLimiter } = require('../rateLimit');

test('RateLimiter allows requests within capacity', () => {
  const limiter = new RateLimiter({ autoCleanup: false });
  const key = 'guild:user:ping';

  const res1 = limiter.consume(key, 2, 1000);
  assert.equal(res1.allowed, true);
  assert.equal(res1.remaining, 1);
  assert.equal(res1.retryAfterMs, 0);

  const res2 = limiter.consume(key, 2, 1000);
  assert.equal(res2.allowed, true);
  assert.equal(res2.remaining, 0);

  const res3 = limiter.consume(key, 2, 1000);
  assert.equal(res3.allowed, false);
  assert.equal(res3.remaining, 0);
  assert.ok(res3.retryAfterMs > 0);
});

test('RateLimiter check() inspects capacity without consuming points', () => {
  const limiter = new RateLimiter({ autoCleanup: false });
  const key = 'guild:user:check';

  const check1 = limiter.check(key, 1, 1000);
  assert.equal(check1.allowed, true);
  assert.equal(check1.remaining, 1);

  limiter.consume(key, 1, 1000);

  const check2 = limiter.check(key, 1, 1000);
  assert.equal(check2.allowed, false);
  assert.equal(check2.remaining, 0);
  assert.ok(check2.retryAfterMs > 0);
});

test('RateLimiter reset() and clear() work correctly', () => {
  const limiter = new RateLimiter({ autoCleanup: false });
  limiter.consume('k1', 1, 1000);
  limiter.consume('k2', 1, 1000);
  assert.equal(limiter.size, 2);

  limiter.reset('k1');
  assert.equal(limiter.size, 1);

  limiter.clear();
  assert.equal(limiter.size, 0);
});

test('RateLimiter cleanupExpired() purges expired keys', async () => {
  const limiter = new RateLimiter({ autoCleanup: false });
  limiter.consume('temp-key', 1, 50); // 50ms TTL

  assert.equal(limiter.size, 1);

  await new Promise(resolve => setTimeout(resolve, 70));
  limiter.cleanupExpired();

  assert.equal(limiter.size, 0);
});
