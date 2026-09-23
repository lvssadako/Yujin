const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function fixture(t, coins = 5000, { withLoan = true } = {}) {
  const parent = path.resolve(__dirname, '..');
  const root = fs.mkdtempSync(path.join(parent, '.tmp-loan-payment-'));
  t.after(() => {
    assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith('.tmp-loan-payment-'));
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(root + path.sep)) delete require.cache[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = path.resolve(__dirname, '../../../../..');
  const files = [
    'src/commands/economy/loan.js',
    'src/services/economy/index.js',
    'src/services/economy/loanService.js',
    'src/services/economy/loanRules.js',
    'src/services/economy/economyLock.js',
    'src/services/economy/loanPaymentService.js',
    'src/services/economy/loanGrantService.js',
    'src/services/economy/loanPaymentStore.js',
    'src/utils/jsonStore.js'
  ];
  function copy(file) {
    assert.ok(!path.isAbsolute(file) && !file.split('/').includes('..'));
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(project, file), destination);
    return destination;
  }
  files.forEach(copy);
  const load = file => require(path.join(root, file));
  const economy = load('src/services/economy/index.js').economyService;
  const loans = load('src/services/economy/loanService.js');
  const { createLoanPaymentService } = load('src/services/economy/loanPaymentService.js');
  const dataDir = path.join(root, 'data');
  const service = createLoanPaymentService({ dataDir });
  const guild = 'synthetic-guild';
  const user = 'synthetic-user';
  economy.addCoins(guild, user, coins);
  if (withLoan) {
    assert.equal(loans.takeLoan(guild, user, 1000).success, true);
    assert.equal(loans.getUserLoanSummary(guild, user).balance, 1050);
  }
  const request = { guildId: guild, userId: user, source: 'slash', deliveryId: 'delivery-1', amount: '400' };
  const raw = name => JSON.parse(fs.readFileSync(path.join(dataDir, `${name}.json`), 'utf8'));
  return { root, copy, load, dataDir, economy, loans, createLoanPaymentService, service, guild, user, request, raw };
}

module.exports = { fixture };
