const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { createWebhookServer, verifySignature } = require('../githubWebhookService');
const { createDeliveryStore } = require('../deliveryStore');

const SECRET = 'synthetic-test-secret';
const BRANCH = 'test-branch';
const bodyFor = (extra = {}) => JSON.stringify({ ref: `refs/heads/${BRANCH}`, ...extra });
const sign = body => 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

async function fixture(t, options = {}) {
  const base = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(base, 'lcobot-webhook-'));
  const servers = [];
  const calls = [];
  t.after(async () => {
    for (const server of servers) {
      await server.waitForIdle();
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
    assert.equal(path.dirname(path.resolve(dir)), base);
    assert.ok(path.basename(dir).startsWith('lcobot-webhook-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  async function start(overrides = {}) {
    const server = createWebhookServer({ secret: SECRET, branch: BRANCH,
      store: createDeliveryStore(dir), deploy: async branch => { calls.push(branch); },
      ...options, ...overrides });
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server;
  }
  return { dir, calls, start, server: await start() };
}

function request(server, { method = 'POST', route = '/webhook', body = bodyFor(), id = 'delivery-1', headers = {}, chunks } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: route, method,
      headers: { 'content-type': 'application/json', 'x-github-event': 'push',
        'x-github-delivery': id, 'x-hub-signature-256': sign(body), ...headers } }, res => {
      const parts = [];
      res.on('data', chunk => parts.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(parts).toString();
        resolve({ status: res.statusCode, headers: res.headers, body: raw ? JSON.parse(raw) : null });
      });
    });
    req.on('error', reject);
    if (chunks) { for (const chunk of chunks) req.write(chunk); req.end(); }
    else req.end(method === 'GET' || method === 'HEAD' ? undefined : body);
  });
}

function records(dir) { return JSON.parse(fs.readFileSync(path.join(dir, 'deliveries.json'), 'utf8')).records; }

test('missing secrets and invalid signatures reject deployment without state writes', async t => {
  const f = await fixture(t, { secret: '' });
  assert.equal((await request(f.server)).status, 503);
  assert.deepEqual(fs.readdirSync(f.dir), []);
  const enabled = await f.start({ secret: SECRET });
  for (const signature of ['', 'sha256=bad', 'sha256=' + '0'.repeat(64)]) {
    assert.equal((await request(enabled, { headers: { 'x-hub-signature-256': signature } })).status, 401);
  }
  assert.equal((await request(enabled, { body: bodyFor({ changed: true }), headers: { 'x-hub-signature-256': sign(bodyFor()) } })).status, 401);
  assert.equal(verifySignature('   ', sign('{}'), Buffer.from('{}')), false);
  assert.equal(verifySignature(SECRET, undefined, Buffer.from('{}')), false);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(fs.readdirSync(f.dir), []);
});

test('health aliases expose only liveness and unknown routes do not enumerate endpoints', async t => {
  const f = await fixture(t, { secret: '' });
  for (const route of ['/', '/health', '/status', '/api/health', '/healthcheck', '/api/webhook/']) {
    const response = await request(f.server, { method: 'GET', route });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'online' });
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal((await request(f.server, { method: 'HEAD', route: '/health' })).body, null);
  assert.deepEqual((await request(f.server, { method: 'GET', route: '/missing' })).body, { error: 'Not found' });
  assert.equal((await request(f.server, { method: 'OPTIONS' })).status, 204);
  assert.equal(f.calls.length, 0);
});

test('valid UTF-8 raw bytes across chunks are signed before parsing; reservation precedes execution', async t => {
  let f;
  f = await fixture(t, { deploy: async branch => {
    assert.equal(branch, BRANCH);
    assert.equal(records(f.dir)[0].status, 'pending');
    assert.ok(fs.existsSync(path.join(f.dir, 'deployment.lock')));
    f.calls.push(branch);
  } });
  const raw = Buffer.from(bodyFor({ message: 'Yujin 🌟' }));
  const split = raw.indexOf(Buffer.from('🌟')) + 1;
  assert.equal((await request(f.server, { body: raw, chunks: [raw.subarray(0, split), raw.subarray(split)] })).status, 202);
  await f.server.waitForIdle();
  assert.equal(f.calls.length, 1);
  assert.equal(records(f.dir)[0].status, 'completed');
  assert.equal(fs.existsSync(path.join(f.dir, 'deployment.lock')), false);
});

test('completed deliveries and identical signed bodies remain deduplicated after server recreation', async t => {
  const f = await fixture(t);
  assert.equal((await request(f.server)).status, 202);
  await f.server.waitForIdle();
  await new Promise(resolve => f.server.close(resolve));
  const restarted = await f.start();
  assert.equal((await request(restarted, { body: bodyFor({ changed: true }) })).body.status, 'duplicate');
  assert.equal((await request(restarted, { id: 'changed-header' })).body.status, 'duplicate');
  assert.equal(f.calls.length, 1);
  assert.equal(records(f.dir).length, 1);
});

test('shared persistent lock prevents overlapping deployments in separate server instances', async t => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = await fixture(t, { deploy: async () => { f.calls.push('started'); await gate; } });
  const second = await f.start();
  try {
    assert.equal((await request(f.server)).status, 202);
    assert.equal((await request(second)).status, 503);
    assert.equal((await request(second, { id: 'delivery-2', body: bodyFor({ commit: 'other' }) })).status, 503);
    assert.equal(f.calls.length, 1);
  } finally { release(); }
  await f.server.waitForIdle();
  assert.equal((await request(second)).body.status, 'duplicate');
  assert.equal((await request(second, { id: 'delivery-2', body: bodyFor({ commit: 'other' }) })).status, 202);
  await second.waitForIdle();
  assert.equal(f.calls.length, 2);
});

test('simulated crash after reservation blocks restarts, even when the stale lock is removed', async t => {
  const f = await fixture(t);
  createDeliveryStore(f.dir).reserve('unfinished', crypto.createHash('sha256').update('fixture').digest('hex'));
  const restarted = await f.start();
  assert.equal((await request(restarted)).status, 503);
  // Removing a lock alone is deliberately insufficient recovery.
  fs.unlinkSync(path.join(f.dir, 'deployment.lock'));
  assert.equal((await request(restarted)).status, 503);
  assert.equal(f.calls.length, 0);
  assert.equal(records(f.dir)[0].status, 'pending');
});

test('failed deployment stays deduplicated after restart and never reports success', async t => {
  const f = await fixture(t, { deploy: async () => { f.calls.push('failed'); throw new Error('synthetic failure'); } });
  assert.deepEqual((await request(f.server)).body, { status: 'accepted' });
  await f.server.waitForIdle();
  assert.equal(records(f.dir)[0].status, 'failed');
  const restarted = await f.start();
  assert.equal((await request(restarted)).status, 503);
  assert.equal((await request(restarted, { id: 'another', body: bodyFor({ commit: 'new' }) })).status, 503);
  // Simulate operator-confirmed recovery after all executors have stopped.
  fs.unlinkSync(path.join(f.dir, 'deployment.lock'));
  assert.equal((await request(restarted)).body.status, 'duplicate');
  assert.equal(f.calls.length, 1);
});

test('corrupt or unwritable reservation state fails closed without deployment', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.dir, 'deliveries.json'), '{broken');
  assert.equal((await request(f.server)).status, 503);
  assert.equal(fs.readFileSync(path.join(f.dir, 'deliveries.json'), 'utf8'), '{broken');
  const unavailable = await f.start({ store: { reserve() { throw new Error('synthetic IO failure'); } } });
  assert.equal((await request(unavailable)).status, 503);
  assert.equal(f.calls.length, 0);
});

test('completion persistence failure leaves a durable block after successful execution', async t => {
  const f = await fixture(t, { deploy: async () => {
    f.calls.push('deployed');
    // A directory at the destination forces atomic rename to fail on all platforms.
    fs.unlinkSync(path.join(f.dir, 'deliveries.json'));
    fs.mkdirSync(path.join(f.dir, 'deliveries.json'));
  } });
  assert.equal((await request(f.server)).status, 202);
  await f.server.waitForIdle();
  assert.ok(fs.existsSync(path.join(f.dir, 'deployment.lock')));
  assert.equal((await request(await f.start())).status, 503);
  assert.equal(f.calls.length, 1);
});

test('malformed payloads, IDs, content types and repositories cannot deploy', async t => {
  const f = await fixture(t, { repository: 'owner/repo' });
  assert.equal((await request(f.server, { body: '{invalid' })).status, 400);
  assert.equal((await request(f.server, { body: 'null' })).status, 400);
  assert.equal((await request(f.server, { id: '../bad' })).status, 400);
  assert.equal((await request(f.server, { id: '' })).status, 400);
  assert.equal((await request(f.server, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await request(f.server)).status, 403);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(fs.readdirSync(f.dir), []);
});

test('ping, ignored events, branch mismatch and deleted branches do not deploy; form push works', async t => {
  const f = await fixture(t);
  assert.equal((await request(f.server, { headers: { 'x-github-event': 'ping' }, route: '/api/github-webhook/' })).body.status, 'ready');
  assert.equal((await request(f.server, { headers: { 'x-github-event': 'release' } })).body.status, 'ignored');
  assert.equal((await request(f.server, { body: bodyFor({ ref: 'refs/heads/other' }) })).body.status, 'ignored');
  assert.equal((await request(f.server, { body: bodyFor({ deleted: true }) })).body.status, 'ignored');
  assert.equal(f.calls.length, 0);
  const form = 'payload=' + encodeURIComponent(bodyFor());
  assert.equal((await request(f.server, { body: form, headers: { 'content-type': 'application/x-www-form-urlencoded' }, route: '/github-webhook' })).status, 202);
  await f.server.waitForIdle();
  assert.equal(f.calls.length, 1);
});

test('payload limit counts bytes rather than characters before any deployment', async t => {
  const f = await fixture(t, { maxPayloadBytes: 8 });
  assert.equal((await request(f.server, { body: '🌟🌟🌟' })).status, 413);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(fs.readdirSync(f.dir), []);
});
