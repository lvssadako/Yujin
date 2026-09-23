const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [root, action, encoded] = process.argv.slice(2);
assert.ok(path.basename(root).startsWith('.tmp-loan-payment-'));
const options = JSON.parse(encoded);
const load = file => require(path.join(root, file));
const { withLock } = load('src/services/economy/economyLock.js');
const dataDir = path.join(root, 'data');
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const fault = point => { if (point === options.crash) process.exit(73); };
if (action === 'pay') {
  const { createLoanPaymentService } = load('src/services/economy/loanPaymentService.js');
  const service = createLoanPaymentService({ dataDir, fault });
  process.stdout.write(JSON.stringify(service.pay(options.request)));
} else if (action === 'credit') {
  const { economyService } = load('src/services/economy/index.js');
  for (let i = 0; i < options.count; i++) economyService.addCoins(options.guild, options.user, 1);
} else if (action === 'interest') {
  const loans = load('src/services/economy/loanService.js');
  loans.applyInterestTick(options.guild, options.user, { force: false, now: options.now });
} else if (action === 'adapter') {
  const Adapter = load('src/database/adapters/JsonAdapter.js');
  const adapter = new Adapter({ dataDir });
  // set es async por contrato, pero su sección de IO no contiene await.
  Promise.all(Array.from({ length: options.count }, (_, i) => adapter.set('economy', `${options.prefix}-${i}`, i)))
    .catch(error => { console.error(error); process.exitCode = 1; });
} else if (action === 'hold') {
  withLock(dataDir, () => {
    fs.writeFileSync(path.join(root, 'holder-ready'), 'ready');
    sleep(options.ms);
  }, { fault });
} else if (action === 'section') {
  for (let i = 0; i < options.count; i++) {
    withLock(dataDir, () => {
      const guard = path.join(root, 'critical-section');
      const fd = fs.openSync(guard, 'wx'); // Dos procesos dentro a la vez fallarían aquí.
      fs.closeSync(fd);
      sleep(2);
      fs.unlinkSync(guard);
    });
  }
} else if (action === 'stale') {
  const store = load('src/services/economy/loanPaymentStore.js');
  const file = path.join(dataDir, 'economy.json');
  const stale = store.readManaged(file);
  fs.writeFileSync(path.join(root, 'stale-ready'), 'ready');
  while (!fs.existsSync(path.join(root, 'stale-write'))) sleep(5);
  stale.guilds[options.guild][options.user].coins += 100;
  assert.throws(() => store.writeManaged(file, stale), /Stale economic state/);
} else {
  throw new Error('Unknown synthetic action');
}
