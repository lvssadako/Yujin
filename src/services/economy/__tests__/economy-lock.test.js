const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { fixture } = require('./fixtures/loan-payment-fixture');
const worker = path.join(__dirname, 'fixtures/economy-lock-worker.js');

function start(t, f, action, options = {}) {
  const child = spawn(process.execPath, [worker, f.root, action, JSON.stringify(options)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
  const timer = setTimeout(() => child.kill(), 20000);
  done.finally(() => clearTimeout(timer));
  t.after(async () => { if (child.exitCode === null) child.kill(); await done; });
  return done;
}

async function okay(done) {
  const result = await done;
  assert.equal(result.stderr, '');
  assert.equal(result.code, 0);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

async function together(jobs) {
  const results = await Promise.allSettled(jobs);
  return results.map(result => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}

async function waitFile(f, name) {
  for (let i = 0; i < 500; i++) {
    if (fs.existsSync(path.join(f.root, name))) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Synthetic child did not become ready');
}

test('procesos independientes nunca entran juntos en la sección económica', async t => {
  const f = fixture(t);
  await together(Array.from({ length: 4 }, () => okay(start(t, f, 'section', { count: 20 }))));
});

test('créditos concurrentes se conservan incluso antes del primer pago', async t => {
  const f = fixture(t);
  await together(Array.from({ length: 4 }, () => okay(start(t, f, 'credit', { guild: f.guild, user: f.user, count: 20 }))));
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 5080);
  assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 0);
});

test('misma entrega desde cuatro procesos descuenta y reduce la deuda una sola vez', async t => {
  const f = fixture(t);
  const results = await together(Array.from({ length: 4 }, () => okay(start(t, f, 'pay', { request: f.request }))));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 4600);
  assert.equal(f.raw('loans').guilds[f.guild][f.user].balance, 650);
});

test('entregas diferentes concurrentes conservan el límite de sobrepago', async t => {
  const f = fixture(t);
  const results = await together(Array.from({ length: 3 }, (_, i) => okay(start(t, f, 'pay', {
    request: { ...f.request, deliveryId: `unique-${i}` }
  }))));
  assert.equal(results.reduce((sum, result) => sum + result.paid, 0), 1050);
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 3950);
  assert.equal(f.raw('loans').guilds[f.guild][f.user].balance, 0);
});

test('pagos y créditos de otros procesos mantienen ambas escrituras', async t => {
  const f = fixture(t);
  await together([
    okay(start(t, f, 'pay', { request: f.request })),
    okay(start(t, f, 'credit', { guild: f.guild, user: f.user, count: 20 }))
  ]);
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 4620);
  assert.equal(f.raw('loans').guilds[f.guild][f.user].balance, 650);
});

test('dos schedulers en procesos distintos no duplican el intervalo de 24 horas', async t => {
  const f = fixture(t);
  const now = f.raw('loans').guilds[f.guild][f.user].lastInterestTick + f.loans.TICK_INTERVAL_MS;
  await together(Array.from({ length: 2 }, () => okay(start(t, f, 'interest', { guild: f.guild, user: f.user, now }))));
  const loan = f.raw('loans').guilds[f.guild][f.user];
  assert.equal(loan.tickCount, 1);
  assert.equal(loan.balance, 1103);
});

test('el adaptador JSON coordina sus escrituras sin perder las de otro proceso', async t => {
  const f = fixture(t);
  f.copy('src/database/adapters/JsonAdapter.js');
  f.copy('src/database/adapters/baseAdapter.js');
  await together(['a', 'b'].map(prefix => okay(start(t, f, 'adapter', { prefix, count: 10 }))));
  const economy = f.raw('economy');
  for (const prefix of ['a', 'b']) for (let i = 0; i < 10; i++) assert.equal(economy[`${prefix}-${i}`], i);
  assert.equal(economy.guilds[f.guild][f.user].coins, 5000);
});

test('misma entrega en servidores distintos mantiene pagos aislados entre procesos', async t => {
  const f = fixture(t);
  f.economy.addCoins('other-guild', f.user, 5000);
  f.loans.takeLoan('other-guild', f.user, 1000);
  await together([f.guild, 'other-guild'].map(guildId => okay(start(t, f, 'pay', {
    request: { ...f.request, guildId }
  }))));
  for (const guild of [f.guild, 'other-guild']) {
    assert.equal(f.raw('economy').guilds[guild][f.user].coins, 4600);
    assert.equal(f.raw('loans').guilds[guild][f.user].balance, 650);
  }
});

test('varios recuperadores pueden limpiar el mismo turno muerto sin robar turnos nuevos', async t => {
  const f = fixture(t);
  const stopped = spawnSync(process.execPath, [worker, f.root, 'pay', JSON.stringify({
    request: f.request, crash: 'wallet:after-rename'
  })], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.ifError(stopped.error);
  assert.equal(stopped.status, 73);
  await together(Array.from({ length: 4 }, () => okay(start(t, f, 'pay', { request: f.request }))));
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 4600);
  assert.equal(f.raw('loans').guilds[f.guild][f.user].balance, 650);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, '.economy-lock')), []);
});

for (const crash of ['lock:before-register', 'lock:after-register', 'lock:after-ticket', 'lock:entered',
  'prepared:after-rename', 'wallet:after-rename', 'loan:after-rename']) {
  test(`reinicio real descarta solo el turno del proceso muerto en ${crash}`, async t => {
    const f = fixture(t);
    const run = spawnSync(process.execPath, [worker, f.root, 'pay', JSON.stringify({ request: f.request, crash })],
      { encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.ifError(run.error);
    assert.equal(run.stderr, '');
    assert.equal(run.status, 73);
    await okay(start(t, f, 'pay', { request: f.request }));
    assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 4600);
    assert.equal(f.raw('loans').guilds[f.guild][f.user].balance, 650);
  });
}

test('un turno activo no caduca: se rechaza esperar más del límite sin robarlo', async t => {
  const f = fixture(t);
  const holder = start(t, f, 'hold', { ms: 400 });
  await waitFile(f, 'holder-ready');
  const { withLock } = f.load('src/services/economy/economyLock.js');
  assert.throws(() => withLock(f.dataDir, () => assert.fail('entered concurrently'), { timeoutMs: 30 }), /storage busy/);
  await okay(holder);
  assert.equal(withLock(f.dataDir, () => 'released'), 'released');
});

test('una lectura antigua de otro proceso no reemplaza un movimiento posterior', async t => {
  const f = fixture(t);
  const pending = start(t, f, 'stale', { guild: f.guild, user: f.user });
  await waitFile(f, 'stale-ready');
  f.economy.addCoins(f.guild, f.user, 50);
  fs.writeFileSync(path.join(f.root, 'stale-write'), 'go');
  await okay(pending);
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 5050);
});

test('bloqueos reentrantes y excepciones limpian su turno, sin afectar otro directorio', t => {
  const f = fixture(t);
  const { withLock } = f.load('src/services/economy/economyLock.js');
  withLock(f.dataDir, () => {
    assert.equal(withLock(f.dataDir, () => 42), 42);
    assert.equal(withLock(path.join(f.root, 'other'), () => 7), 7);
  });
  assert.throws(() => withLock(f.dataDir, () => { throw new Error('synthetic'); }), /synthetic/);
  assert.deepEqual(fs.readdirSync(path.join(f.dataDir, '.economy-lock')), []);
  assert.throws(() => withLock(f.dataDir, async () => 1), /synchronous/);
});
