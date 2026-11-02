const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture } = require('./fixtures/loan-payment-fixture');

function setup(t, coins = 0) {
  const f = fixture(t, coins, { withLoan: false });
  f.request = { ...f.request, amount: '1000' };
  f.createGrant = f.load('src/services/economy/loanGrantService.js').createLoanGrantService;
  f.grants = f.createGrant({ dataDir: f.dataDir });
  return f;
}

function child(f, action, point = '', request = f.request) {
  const run = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/loan-payment-worker.js'),
    f.root, action, point, JSON.stringify(request)], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.ifError(run.error);
  assert.equal(run.stderr, '');
  return run;
}

function read(f, name) {
  return f.load('src/services/economy/loanPaymentStore.js').readState(path.join(f.dataDir, `${name}.json`));
}

function balances(f, coins, debt, request = f.request) {
  assert.equal(read(f, 'economy').guilds[request.guildId]?.[request.userId]?.coins ?? 0, coins);
  assert.equal(read(f, 'loans').guilds[request.guildId]?.[request.userId]?.balance ?? 0, debt);
}

const boundaries = ['before-write', 'after-sync', 'before-rename', 'after-rename'];
for (const stage of ['prepared', 'wallet', 'loan', 'committed']) {
  for (const boundary of boundaries) {
    test(`otorgamiento: caída real en ${stage}:${boundary} y recuperación repetida`, t => {
      const f = setup(t);
      const run = child(f, 'grant', `${stage}:${boundary}`);
      assert.equal(run.status, 73);
      assert.equal(run.stdout, '', 'no anunciar éxito con persistencia pendiente');
      assert.equal(child(f, 'recover').status, 0);
      const prepared = stage !== 'prepared' || boundary === 'after-rename';
      balances(f, prepared ? 1000 : 0, prepared ? 1050 : 0);
      const retry = child(f, 'grant');
      assert.equal(retry.status, 0);
      assert.equal(JSON.parse(retry.stdout).credited, 1000);
      balances(f, 1000, 1050);
      assert.equal(f.raw('loan-payments').version, 2);
      assert.equal(f.raw('loan-payments').pending, null);
      const duplicate = child(f, 'grant');
      assert.equal(duplicate.status, 0);
      assert.equal(JSON.parse(duplicate.stdout).duplicate, true);
      balances(f, 1000, 1050);
      assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 1);
    });
  }
}

for (const boundary of boundaries) {
  test(`otorgamiento rechazado: caída en rejected:${boundary}`, t => {
    const f = setup(t);
    const invalid = { ...f.request, amount: '499' };
    assert.equal(child(f, 'grant', `rejected:${boundary}`, invalid).status, 73);
    assert.equal(child(f, 'recover').status, 0);
    const retry = child(f, 'grant', '', invalid);
    assert.equal(retry.status, 0);
    assert.equal(JSON.parse(retry.stdout).success, false);
    assert.equal(JSON.parse(child(f, 'grant', '', invalid).stdout).duplicate, true);
    balances(f, 0, 0);
  });
}

test('recuperación del otorgamiento interrumpida más de una vez', t => {
  const f = setup(t);
  assert.equal(child(f, 'grant', 'wallet:after-rename').status, 73);
  const projected = f.raw('loan-payments').pending.loans.after;
  assert.equal(child(f, 'recover', 'loan:after-sync').status, 73);
  assert.equal(child(f, 'recover', 'committed:after-rename').status, 73);
  assert.equal(child(f, 'recover').status, 0);
  balances(f, 1000, 1050);
  assert.deepEqual(f.loans.getLoan(f.guild, f.user), projected, 'no recalcular fecha ni interés al reiniciar');
});

test('excepciones en cada frontera son recuperables sin acreditar otra vez', t => {
  for (const stage of ['prepared', 'wallet', 'loan', 'committed']) {
    for (const boundary of boundaries) {
      const f = setup(t);
      const faulty = f.createGrant({ dataDir: f.dataDir,
        fault(point) { if (point === `${stage}:${boundary}`) throw new Error('synthetic IO failure'); } });
      assert.throws(() => faulty.grant(f.request), /synthetic IO failure/);
      f.grants.recover();
      f.grants.grant(f.request);
      balances(f, 1000, 1050);
    }
  }
});

test('límites inclusivos e interés inicial del 5% con el redondeo actual', t => {
  for (const amount of [500, 501, 1000, 100000]) {
    const f = setup(t, 50);
    const result = f.grants.grant({ ...f.request, amount: String(amount) });
    assert.equal(result.success, true);
    assert.equal(result.credited, amount);
    assert.equal(result.initialInterest, Math.ceil(amount * 0.05));
    balances(f, 50 + amount, amount + Math.ceil(amount * 0.05));
    const loan = f.loans.getLoan(f.guild, f.user);
    assert.equal(loan.active, true);
    assert.equal(loan.principal, amount);
    assert.equal(loan.createdAt, loan.lastInterestTick);
    assert.equal(loan.tickCount, 0);
    assert.equal(loan.penaltyLevel, 0);
  }
});

test('crear entradas ausentes conserva otros usuarios, gemas, banco e inventario', t => {
  const f = setup(t, 20);
  f.economy.addGems(f.guild, f.user, 7);
  f.economy.addBank(f.guild, f.user, 100);
  f.economy.addItem(f.guild, f.user, 'synthetic-item', 2);
  f.grants.grant(f.request);
  assert.deepEqual(f.economy.getBalance(f.guild, f.user), { coins: 1020, gems: 7, bank: 100 });
  assert.deepEqual(f.economy.getInventory(f.guild, f.user), { 'synthetic-item': 2 });
  const other = { ...f.request, guildId: 'other-guild' };
  assert.equal(child(f, 'grant', 'wallet:after-rename', other).status, 73);
  f.grants.recover();
  balances(f, 1020, 1050);
  balances(f, 1000, 1050, other);
  assert.deepEqual(read(f, 'economy').guilds[other.guildId][other.userId], { coins: 1000, gems: 0, bank: 0, inventory: {} });
  const sameGuild = { ...f.request, userId: 'other-user' };
  f.grants.grant(sameGuild);
  balances(f, 1000, 1050, sameGuild);
  assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 3);
});

test('concurrencia en un proceso: una entrega y solicitudes distintas no otorgan dos préstamos', async t => {
  const f = setup(t);
  const duplicates = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => f.grants.grant(f.request))));
  assert.equal(duplicates.filter(result => !result.duplicate).length, 1);
  balances(f, 1000, 1050);
  const attempts = await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() =>
    f.grants.grant({ ...f.request, deliveryId: `new-${i}` }))));
  assert.ok(attempts.every(result => !result.success && /Ya tienes un préstamo activo/.test(result.error)));
  balances(f, 1000, 1050);
  const fresh = setup(t);
  const racing = await Promise.all(Array.from({ length: 10 }, (_, i) => Promise.resolve().then(() =>
    fresh.grants.grant({ ...fresh.request, deliveryId: `race-${i}` }))));
  assert.equal(racing.filter(result => result.success).length, 1);
  balances(fresh, 1000, 1050);
});

test('una entrega antigua no otorga después de liquidar; una nueva sí', t => {
  const f = setup(t, 50);
  f.grants.grant(f.request);
  // El mismo ID con otro tipo de operación es un pago legítimo, no una colisión.
  f.service.pay({ ...f.request, amount: 'all' });
  balances(f, 0, 0);
  const old = child(f, 'grant');
  assert.equal(old.status, 0);
  assert.equal(JSON.parse(old.stdout).duplicate, true);
  balances(f, 0, 0);
  f.grants.grant({ ...f.request, deliveryId: 'new-loan' });
  balances(f, 1000, 1050);
  assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 3);
});

test('rechazo por préstamo activo sigue rechazado después de liquidar', t => {
  const f = setup(t, 50);
  f.grants.grant(f.request);
  const rejected = { ...f.request, deliveryId: 'rejected' };
  assert.equal(f.grants.grant(rejected).success, false);
  f.service.pay({ ...f.request, amount: 'all' });
  const retry = child(f, 'grant', '', rejected);
  assert.equal(retry.status, 0);
  assert.equal(JSON.parse(retry.stdout).success, false);
  assert.equal(JSON.parse(retry.stdout).duplicate, true);
  balances(f, 0, 0);
});

test('pago recupera el otorgamiento pendiente antes de descontar', t => {
  const f = setup(t);
  assert.equal(child(f, 'grant', 'wallet:after-rename').status, 73);
  const payment = f.service.pay({ ...f.request, amount: '400' });
  assert.equal(payment.paid, 400);
  balances(f, 600, 650);
  assert.equal(f.grants.grant(f.request).duplicate, true);
  balances(f, 600, 650);
});

test('otorgamiento recupera el pago pendiente que termina el préstamo anterior', t => {
  const f = setup(t, 50);
  f.grants.grant(f.request);
  assert.equal(child(f, 'pay', 'wallet:after-rename', { ...f.request, amount: 'all' }).status, 73);
  f.grants.grant({ ...f.request, deliveryId: 'next-loan' });
  balances(f, 1000, 1050);
  f.service.recover();
  balances(f, 1000, 1050);
});

test('créditos e intereses posteriores no son reemplazados por un reintento', t => {
  const f = setup(t);
  assert.equal(child(f, 'grant', 'wallet:after-rename').status, 73);
  const start = f.raw('loan-payments').pending.loans.after.createdAt;
  assert.equal(child(f, 'credit').status, 0);
  f.loans.processAllGuildLoans(f.guild, start + f.loans.TICK_INTERVAL_MS);
  balances(f, 1050, 1103);
  f.grants.grant(f.request);
  f.grants.recover();
  balances(f, 1050, 1103);
});

test('copias antiguas y cambios externos incompatibles no sobrescriben saldos', t => {
  const f = setup(t);
  const old = f.economy.readEconomy();
  f.grants.grant(f.request);
  assert.throws(() => f.economy.writeEconomy(old), /Stale economic state/);
  balances(f, 1000, 1050);
  const interrupted = setup(t);
  assert.equal(child(interrupted, 'grant', 'wallet:after-rename').status, 73);
  const current = read(interrupted, 'economy');
  current.guilds[interrupted.guild][interrupted.user].coins += 25;
  fs.writeFileSync(path.join(interrupted.dataDir, 'economy.json'), JSON.stringify(current));
  assert.throws(() => interrupted.grants.recover(), /recovery conflict/);
  balances(interrupted, 1025, 0);
});

test('validación de identidad, cantidades, saldo inválido y overflow', t => {
  const f = setup(t);
  for (const patch of [{ guildId: null }, { userId: '__proto__' }, { deliveryId: undefined }, { source: 'invalid' }]) {
    assert.equal(f.grants.grant({ ...f.request, ...patch }).success, false);
  }
  for (const [i, amount] of ['', '0', '-1', '1.5', '1000junk', '499', '100001', '9007199254740992'].entries()) {
    assert.equal(f.grants.grant({ ...f.request, amount, deliveryId: `invalid-${i}` }).success, false);
  }
  balances(f, 0, 0);
  for (const coins of [-1, 1.5, Number.MAX_SAFE_INTEGER]) {
    const invalid = setup(t);
    const state = read(invalid, 'economy');
    state.guilds[invalid.guild][invalid.user].coins = coins;
    fs.writeFileSync(path.join(invalid.dataDir, 'economy.json'), JSON.stringify(state));
    assert.throws(() => invalid.grants.grant(invalid.request), /Invalid economic amounts/);
    balances(invalid, coins, 0);
  }
  f.grants.grant(f.request);
  assert.equal(f.grants.grant({ ...f.request, amount: '2000' }).success, false);
  balances(f, 1000, 1050);
});

function installLegacy(f, stage) {
  const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/legacy-loan-payment-v1.json'), 'utf8'));
  const pending = legacy.journal.pending;
  if (['wallet', 'loan', 'committed'].includes(stage)) {
    legacy.economy.guilds[f.guild][f.user] = pending.economy.after;
    legacy.economy._loanPaymentRevision = pending.economy.afterRevision;
  }
  if (['loan', 'committed'].includes(stage)) {
    legacy.loans.guilds[f.guild][f.user] = pending.loans.after;
    legacy.loans._loanPaymentRevision = pending.loans.afterRevision;
  }
  if (stage === 'committed') {
    legacy.journal.receipts[pending.key] = { fingerprint: pending.fingerprint, result: pending.result };
    legacy.journal.pending = null;
  }
  for (const [name, data] of Object.entries({ economy: legacy.economy, loans: legacy.loans, 'loan-payments': legacy.journal })) {
    fs.writeFileSync(path.join(f.dataDir, `${name}.json`), JSON.stringify(data));
  }
  return legacy;
}

for (const stage of ['prepared', 'wallet', 'loan', 'committed']) {
  test(`compatibilidad real con fixture v1 en estado ${stage}`, t => {
    const f = setup(t);
    const legacy = installLegacy(f, stage);
    const oldReceipts = structuredClone(legacy.journal.receipts);
    const request = { ...f.request, userId: 'new-user' };
    const grant = child(f, 'grant', '', request);
    assert.equal(grant.status, 0);
    assert.equal(JSON.parse(grant.stdout).credited, 1000);
    balances(f, 4600, 650);
    balances(f, 1000, 1050, request);
    const updated = f.raw('loan-payments');
    assert.equal(updated.version, 2);
    assert.equal(updated.pending, null);
    for (const [key, value] of Object.entries(oldReceipts)) assert.deepEqual(updated.receipts[key], value);
    assert.equal(f.service.pay(legacy.request).duplicate, true);
    assert.equal(f.service.pay(legacy.completedRequest).duplicate, true);
    balances(f, 4600, 650);
    // Los pagos nuevos también funcionan sobre el registro actualizado.
    assert.equal(f.service.pay({ ...legacy.request, deliveryId: 'new-payment', amount: '100' }).paid, 100);
    balances(f, 4500, 550);
  });
}

for (const boundary of boundaries) {
  test(`caída durante actualización v1 a v2 en prepared:${boundary}`, t => {
    const f = setup(t);
    const legacy = installLegacy(f, 'wallet');
    const request = { ...f.request, userId: 'new-user' };
    assert.equal(child(f, 'grant', `prepared:${boundary}`, request).status, 73);
    balances(f, 4600, 650, legacy.request); // El pago viejo se completó antes de preparar el préstamo.
    assert.equal(child(f, 'recover').status, 0);
    assert.equal(child(f, 'grant', '', request).status, 0);
    balances(f, 1000, 1050, request);
    assert.equal(f.service.pay(legacy.request).duplicate, true);
    assert.equal(f.service.pay(legacy.completedRequest).duplicate, true);
    assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 3);
  });
}
