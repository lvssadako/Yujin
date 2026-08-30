const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getLoan,
  takeLoan,
  repayLoan,
  applyInterestTick,
  getUserLoanSummary
} = require('../loanService');

const loansFile = path.join(__dirname, '..', '..', '..', '..', 'data', 'loans.json');

test('loan service: take loan, interest escalation, penalty and repayment', () => {
  const guildId = 'test-guild-loan';
  const userId = 'test-user-loan';

  // 1. Take loan
  const takeRes = takeLoan(guildId, userId, 1000);
  assert.equal(takeRes.success, true);
  assert.equal(takeRes.loan.active, true);
  assert.equal(takeRes.loan.principal, 1000);
  assert.equal(takeRes.loan.balance, 1000);

  // Cannot take another loan while active
  const takeDuplicate = takeLoan(guildId, userId, 2000);
  assert.equal(takeDuplicate.success, false);

  // 2. Apply interest ticks and test escalation
  // Tick 1 (5%)
  const tick1 = applyInterestTick(guildId, userId);
  assert.equal(tick1.interestAdded, 50);
  assert.equal(tick1.newBalance, 1050);
  assert.equal(tick1.penaltyLevel, 0);

  // Ticks 2 and 3
  applyInterestTick(guildId, userId);
  applyInterestTick(guildId, userId);

  // Tick 4 (8% rate escalation)
  const tick4 = applyInterestTick(guildId, userId);
  assert.equal(tick4.newRate, 0.08);

  // 3. Partial repayment
  const repayPartial = repayLoan(guildId, userId, 500);
  assert.equal(repayPartial.success, true);
  assert.equal(repayPartial.cleared, false);
  assert.equal(repayPartial.paid, 500);

  // 4. Full repayment
  const summary = getUserLoanSummary(guildId, userId);
  const repayFull = repayLoan(guildId, userId, summary.balance + 500);
  assert.equal(repayFull.success, true);
  assert.equal(repayFull.cleared, true);
  assert.equal(repayFull.remaining, 0);

  // Loan is now inactive
  const afterSummary = getUserLoanSummary(guildId, userId);
  assert.equal(afterSummary.active, false);

  // Clean test artifacts if created
  try {
    if (fs.existsSync(loansFile)) {
      const data = JSON.parse(fs.readFileSync(loansFile, 'utf8'));
      if (data.guilds && data.guilds[guildId]) {
        delete data.guilds[guildId][userId];
        fs.writeFileSync(loansFile, JSON.stringify(data, null, 2), 'utf8');
      }
    }
  } catch {}
});
