const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resetLoan, getLoan, takeLoan, processAllGuildLoans, TICK_INTERVAL_MS } = require('../../../services/economy/loanService');
const { economyService } = require('../../../services/economy');

const guildId = 'test-guild-dev-resetloan';
const userId = 'user-dev-target-1';

function cleanupTestData() {
  const loansFile = path.join(__dirname, '..', '..', '..', '..', 'data', 'loans.json');
  try {
    if (fs.existsSync(loansFile)) {
      const data = JSON.parse(fs.readFileSync(loansFile, 'utf8'));
      if (data.guilds && data.guilds[guildId]) {
        delete data.guilds[guildId];
        fs.writeFileSync(loansFile, JSON.stringify(data, null, 2), 'utf8');
      }
    }
  } catch {}
}

test('resetLoan: fails if user has no active loan', () => {
  cleanupTestData();

  const res = resetLoan(guildId, userId);
  assert.equal(res.success, false);
  assert.ok(res.reason.includes('no tiene ningún préstamo'));

  cleanupTestData();
});

test('resetLoan: successfully clears debt, balance, penalty and transfer history', () => {
  cleanupTestData();

  takeLoan(guildId, userId, 5000);
  const loanBefore = getLoan(guildId, userId);
  assert.equal(loanBefore.active, true);
  assert.equal(loanBefore.balance, 5250); // 5000 + 5% initial opening interest

  const res = resetLoan(guildId, userId);
  assert.equal(res.success, true);
  assert.equal(res.cleared, true);
  assert.equal(res.previousBalance, 5250);
  assert.equal(res.previousPrincipal, 5000);

  const loanAfter = getLoan(guildId, userId);
  assert.equal(loanAfter.active, false);
  assert.equal(loanAfter.balance, 0);
  assert.equal(loanAfter.principal, 0);
  assert.equal(loanAfter.penaltyLevel, 0);

  cleanupTestData();
});

test('loan time-gating: does not scale within 1 day (only checks elapsed difference)', () => {
  const timeUserId = 'user-dev-target-timegating';
  cleanupTestData();

  const startTime = 1700000000000;
  const takeRes = takeLoan(guildId, timeUserId, 2000, { now: startTime, initialInterestRate: 0 });
  assert.equal(takeRes.success, true);

  // 1 hour elapsed -> 0 loans processed
  const processed1h = processAllGuildLoans(guildId, startTime + (1 * 60 * 60 * 1000));
  assert.equal(processed1h, 0);

  // 12 hours elapsed -> 0 loans processed
  const processed12h = processAllGuildLoans(guildId, startTime + (12 * 60 * 60 * 1000));
  assert.equal(processed12h, 0);

  // 23 hours 59 minutes elapsed -> 0 loans processed
  const processed23h = processAllGuildLoans(guildId, startTime + (23 * 60 * 60 * 1000) + (59 * 60 * 1000));
  assert.equal(processed23h, 0);

  // Exact 24 hours + 1 second elapsed -> 1 loan processed
  const processed24h = processAllGuildLoans(guildId, startTime + TICK_INTERVAL_MS + 1000);
  assert.equal(processed24h, 1);

  const loanAfter24h = getLoan(guildId, timeUserId);
  assert.equal(loanAfter24h.tickCount, 1);
  assert.equal(loanAfter24h.balance, 2100); // 2000 + 5% interest tick

  cleanupTestData();
});
