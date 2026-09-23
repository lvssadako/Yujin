const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { fixture } = require('./fixtures/loan-payment-fixture');

function child(f, action, point = '', request = f.request) {
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'fixtures/loan-payment-worker.js'), f.root, action, point, JSON.stringify(request)
  ], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  return result;
}

function balances(f, coins, debt) {
  assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, coins);
  assert.equal(f.raw('loans').guilds[f.guild][f.user].balance, debt);
}

const boundaries = ['before-write', 'after-sync', 'before-rename', 'after-rename'];
for (const stage of ['prepared', 'wallet', 'loan', 'committed']) {
  for (const boundary of boundaries) {
    test(`caída real en ${stage}:${boundary}, recuperación y reentrega`, t => {
      const f = fixture(t);
      const stopped = child(f, 'pay', `${stage}:${boundary}`);
      assert.equal(stopped.status, 73);
      assert.equal(stopped.stdout, '', 'no confirmar éxito antes de persistir');
      const recovered = child(f, 'recover');
      assert.equal(recovered.status, 0);
      const prepared = stage !== 'prepared' || boundary === 'after-rename';
      balances(f, prepared ? 4600 : 5000, prepared ? 650 : 1050);
      const replay = child(f, 'pay');
      assert.equal(replay.status, 0);
      assert.equal(JSON.parse(replay.stdout).paid, 400);
      balances(f, 4600, 650);
      assert.equal(f.raw('loan-payments').pending, null);
      assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 1);
      const duplicate = child(f, 'pay');
      assert.equal(duplicate.status, 0);
      assert.equal(JSON.parse(duplicate.stdout).duplicate, true);
      balances(f, 4600, 650);
    });
  }
}

for (const boundary of boundaries) {
  test(`rechazo durable: caída en rejected:${boundary}`, t => {
    const f = fixture(t, 200);
    assert.equal(child(f, 'pay', `rejected:${boundary}`).status, 73);
    assert.equal(child(f, 'recover').status, 0);
    const retry = child(f, 'pay');
    assert.equal(retry.status, 0);
    assert.equal(JSON.parse(retry.stdout).success, false);
    balances(f, 200, 1050);
    assert.equal(JSON.parse(child(f, 'pay').stdout).duplicate, true);
  });
}

test('una recuperación también puede caer repetidamente', t => {
  const f = fixture(t);
  assert.equal(child(f, 'pay', 'wallet:after-rename').status, 73);
  assert.equal(child(f, 'recover', 'loan:after-sync').status, 73);
  assert.equal(child(f, 'recover', 'committed:after-sync').status, 73);
  assert.equal(child(f, 'recover').status, 0);
  balances(f, 4600, 650);
  assert.equal(JSON.parse(child(f, 'pay').stdout).duplicate, true);
});

test('primer movimiento después del reinicio recupera antes de acreditar', t => {
  const f = fixture(t);
  assert.equal(child(f, 'pay', 'wallet:after-rename').status, 73);
  assert.equal(child(f, 'credit').status, 0);
  balances(f, 4650, 650);
  f.service.recover();
  f.service.pay(f.request);
  balances(f, 4650, 650);
});

test('errores en cada frontera dejan una intención recuperable sin compensación', t => {
  for (const stage of ['prepared', 'wallet', 'loan', 'committed']) {
    for (const boundary of boundaries) {
      const f = fixture(t);
      const service = f.createLoanPaymentService({
        dataDir: f.dataDir,
        fault(point) { if (point === `${stage}:${boundary}`) throw new Error('synthetic fault'); }
      });
      assert.throws(() => service.pay(f.request), /synthetic fault/);
      f.service.recover();
      f.service.pay(f.request);
      balances(f, 4600, 650);
    }
  }
});

test('rename fallido y escritura temporal incompleta no usan copia al destino', t => {
  for (const file of ['loan-payments.json', 'economy.json', 'loans.json']) {
    const f = fixture(t);
    const original = fs.renameSync;
    const mock = t.mock.method(fs, 'renameSync', (from, to) => {
      if (to === path.join(f.dataDir, file)) throw new Error('synthetic rename failure');
      return original(from, to);
    });
    assert.throws(() => f.service.pay(f.request), /synthetic rename failure/);
    if (file !== 'loans.json') balances(f, 5000, 1050);
    else balances(f, 4600, 1050);
    mock.mock.restore();
    f.service.pay(f.request);
    balances(f, 4600, 650);
  }
  const f = fixture(t);
  const original = fs.writeFileSync;
  const mock = t.mock.method(fs, 'writeFileSync', (fd, payload, ...args) => {
    if (typeof fd === 'number') {
      original(fd, payload.slice(0, 10), ...args);
      throw new Error('synthetic disk full');
    }
    return original(fd, payload, ...args);
  });
  assert.throws(() => f.service.pay(f.request), /synthetic disk full/);
  mock.mock.restore();
  balances(f, 5000, 1050);
  f.service.pay(f.request);
  balances(f, 4600, 650);
});

test('concurrencia dentro de un proceso: duplicados y pagos distintos', async t => {
  const f = fixture(t);
  const results = await Promise.all(Array.from({ length: 20 }, () => Promise.resolve().then(() => f.service.pay(f.request))));
  assert.equal(results.filter(result => !result.duplicate).length, 1);
  balances(f, 4600, 650);
  const more = await Promise.all(Array.from({ length: 10 }, (_, n) => Promise.resolve().then(() =>
    f.service.pay({ ...f.request, deliveryId: `new-${n}`, amount: '100' }))));
  assert.equal(more.filter(result => result.success).reduce((sum, result) => sum + result.paid, 0), 650);
  balances(f, 3950, 0);
  assert.equal(Object.keys(f.raw('loan-payments').receipts).length, 11);
});

test('aislamiento y preservación de otros usuarios, servidores, gemas y banco', t => {
  const f = fixture(t);
  f.economy.addGems(f.guild, f.user, 7);
  f.economy.addBank(f.guild, f.user, 200);
  f.economy.addCoins(f.guild, 'other-user', 99);
  f.economy.addCoins('other-guild', f.user, 1000);
  f.loans.takeLoan('other-guild', f.user, 1000);
  assert.equal(child(f, 'pay', 'wallet:after-rename').status, 73);
  f.economy.addCoins(f.guild, 'other-user', 10); // barrera antes de leer
  f.service.pay({ ...f.request, guildId: 'other-guild' }); // misma entrega, otro contexto
  assert.equal(f.economy.getBalance(f.guild, 'other-user').coins, 109);
  assert.deepEqual(f.economy.getBalance(f.guild, f.user), { coins: 4600, gems: 7, bank: 200 });
  assert.equal(f.economy.getBalance('other-guild', f.user).coins, 600);
  assert.equal(f.loans.getLoan('other-guild', f.user).balance, 650);
  f.service.recover();
  assert.equal(f.economy.getBalance(f.guild, 'other-user').coins, 109);
});

test('el scheduler recupera antes de calcular intereses; el reintento no los revierte', t => {
  const f = fixture(t);
  const start = f.loans.getLoan(f.guild, f.user).lastInterestTick;
  assert.equal(child(f, 'pay', 'wallet:after-rename').status, 73);
  assert.equal(f.loans.processAllGuildLoans(f.guild, start + f.loans.TICK_INTERVAL_MS), 1);
  balances(f, 4600, 683); // 650 + ceil(650 * 0.05)
  f.service.pay(f.request);
  balances(f, 4600, 683);
});

test('copias antiguas se rechazan incluso si otro pago empieza sin await', t => {
  const f = fixture(t);
  const old = f.economy.readEconomy();
  f.service.pay(f.request);
  old.guilds[f.guild][f.user].coins += 50;
  assert.throws(() => f.economy.writeEconomy(old), /Stale economic state/);
  balances(f, 4600, 650);
});

test('la utilidad heredada también recupera y conserva el crédito posterior', t => {
  const f = fixture(t);
  f.copy('src/utils/economy.js');
  // Solo el logger se simula; no se importa el bot ni se crean logs operativos.
  const loggerFile = path.join(f.root, 'src/utils/logger.js');
  fs.writeFileSync(loggerFile, 'module.exports = { info() {} };');
  const legacy = f.load('src/utils/economy.js');
  assert.equal(child(f, 'pay', 'wallet:after-rename').status, 73);
  legacy.addCoins(f.guild, f.user, 50);
  balances(f, 4650, 650);
  f.service.pay(f.request);
  balances(f, 4650, 650);
});

test('el adaptador JSON rechaza una copia anterior al pago', async t => {
  const f = fixture(t);
  f.copy('src/database/adapters/baseAdapter.js');
  f.copy('src/database/adapters/jsonAdapter.js');
  const Adapter = f.load('src/database/adapters/jsonAdapter.js');
  const adapter = new Adapter({ dataDir: f.dataDir });
  const old = await adapter.getAll('economy');
  f.service.pay(f.request);
  old.guilds[f.guild][f.user].coins = 5001;
  await assert.rejects(() => adapter.updateAll('economy', old), /Stale economic state/);
  balances(f, 4600, 650);
});

test('escritura externa incompatible bloquea recuperación sin restaurar snapshots', t => {
  const f = fixture(t);
  assert.equal(child(f, 'pay', 'prepared:after-rename').status, 73);
  const external = f.raw('loans');
  external.guilds[f.guild][f.user].balance += 50;
  fs.writeFileSync(path.join(f.dataDir, 'loans.json'), JSON.stringify(external));
  assert.throws(() => f.service.recover(), /recovery conflict/);
  assert.throws(() => f.economy.addCoins(f.guild, f.user, 10), /recovery conflict/);
  balances(f, 5000, 1100);
  assert.notEqual(f.raw('loan-payments').pending, null);
});

test('un movimiento externo después del débito no se sobrescribe aunque conserve el marcador', t => {
  const f = fixture(t);
  assert.equal(child(f, 'pay', 'wallet:after-rename').status, 73);
  const external = f.raw('economy');
  external.guilds[f.guild][f.user].coins += 50;
  fs.writeFileSync(path.join(f.dataDir, 'economy.json'), JSON.stringify(external));
  assert.throws(() => f.service.recover(), /applied entry changed/);
  balances(f, 4650, 1050);
  assert.notEqual(f.raw('loan-payments').pending, null);
});

test('recuperar una entrada conserva cambios externos de otros usuarios', t => {
  const f = fixture(t);
  assert.equal(child(f, 'pay', 'prepared:after-rename').status, 73);
  const external = f.raw('economy');
  external.guilds[f.guild]['other-user'] = { coins: 99, gems: 3, bank: 4 };
  fs.writeFileSync(path.join(f.dataDir, 'economy.json'), JSON.stringify(external));
  f.service.recover();
  balances(f, 4600, 650);
  assert.deepEqual(f.raw('economy').guilds[f.guild]['other-user'], { coins: 99, gems: 3, bank: 4 });
});

test('una entrega antigua no paga un préstamo nuevo del mismo usuario', t => {
  const f = fixture(t);
  const request = { ...f.request, amount: 'all' };
  assert.equal(f.service.pay(request).paid, 1050);
  f.loans.takeLoan(f.guild, f.user, 1000);
  const duplicate = child(f, 'pay', '', request);
  assert.equal(duplicate.status, 0);
  assert.equal(JSON.parse(duplicate.stdout).duplicate, true);
  balances(f, 3950, 1050);
});

test('registro o estados corruptos bloquean sin sustituirlos por objetos vacíos', t => {
  for (const name of ['loan-payments', 'economy', 'loans']) {
    const f = fixture(t);
    assert.equal(child(f, 'pay', 'prepared:after-rename').status, 73);
    const file = path.join(f.dataDir, `${name}.json`);
    fs.writeFileSync(file, '{broken');
    assert.throws(() => f.service.recover());
    assert.throws(() => f.economy.getBalance(f.guild, f.user));
    assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
  }
});

test('rechazo no se convierte en pago al repetir entrega después de recibir fondos', t => {
  const f = fixture(t, 100);
  assert.equal(f.service.pay(f.request).success, false);
  f.economy.addCoins(f.guild, f.user, 500);
  const replay = JSON.parse(child(f, 'pay').stdout);
  assert.equal(replay.success, false);
  assert.equal(replay.duplicate, true);
  balances(f, 600, 1050);
  assert.equal(f.service.pay({ ...f.request, deliveryId: 'new-delivery' }).success, true);
  balances(f, 200, 650);
});

test('validación de identidad, cantidades y colisión de entrega', t => {
  const f = fixture(t);
  for (const patch of [{ guildId: null }, { userId: '__proto__' }, { source: 'unknown' }, { deliveryId: undefined }]) {
    assert.equal(f.service.pay({ ...f.request, ...patch }).success, false);
  }
  for (const amount of ['0', '-1', '1.5', '100junk', 'NaN', '9007199254740992']) {
    assert.equal(f.service.pay({ ...f.request, deliveryId: `invalid-${amount.replace(/[^a-zA-Z0-9]/g, '')}`, amount }).success, false);
  }
  balances(f, 5000, 1050);
  f.service.pay(f.request);
  assert.equal(f.service.pay({ ...f.request, amount: '500' }).success, false);
  balances(f, 4600, 650);
});

test('saldos inválidos o deuda superior al techo no se cobran ni se sanea el archivo al pagar', t => {
  for (const [name, field, value] of [
    ['economy', 'coins', -1], ['economy', 'coins', 1.5],
    ['loans', 'balance', 2501], ['loans', 'balance', 1.5]
  ]) {
    const f = fixture(t);
    const data = f.raw(name);
    data.guilds[f.guild][f.user][field] = value;
    const file = path.join(f.dataDir, `${name}.json`);
    const before = JSON.stringify(data);
    fs.writeFileSync(file, before);
    const journalBefore = f.raw('loan-payments');
    assert.throws(() => f.service.pay(f.request), /Invalid economic amounts/);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    assert.deepEqual(f.raw('loan-payments'), journalBefore);
  }
});

test('la API compartida no conserva estado de deduplicación solo en memoria', t => {
  const f = fixture(t);
  f.service.pay(f.request);
  const service = f.createLoanPaymentService({ dataDir: f.dataDir });
  assert.equal(service.pay(f.request).duplicate, true);
  const receipt = Object.values(f.raw('loan-payments').receipts)[0];
  assert.equal(receipt.result.paid, 400);
  assert.equal(receipt.result.coins, 4600);
});

test('pruebas previas del servicio económico y préstamos en copia aislada', t => {
  const f = fixture(t);
  const tests = ['economy-service.test.js', 'loan-service.test.js'].map(name =>
    f.copy(`src/services/economy/__tests__/${name}`));
  const run = spawnSync(process.execPath, ['--test', ...tests], {
    encoding: 'utf8', timeout: 20000, windowsHide: true, cwd: f.root
  });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
