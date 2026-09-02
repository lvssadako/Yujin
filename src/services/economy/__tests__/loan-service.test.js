const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  getLoan,
  takeLoan,
  repayLoan,
  applyInterestTick,
  processAllGuildLoans,
  getUserLoanSummary,
  MAX_DEBT_MULTIPLIER,
  TICK_INTERVAL_MS
} = require('../loanService');

const loansFile = path.join(__dirname, '..', '..', '..', '..', 'data', 'loans.json');

function cleanupTestUser(guildId, userId) {
  try {
    if (fs.existsSync(loansFile)) {
      const data = JSON.parse(fs.readFileSync(loansFile, 'utf8'));
      if (data.guilds && data.guilds[guildId]) {
        delete data.guilds[guildId][userId];
        fs.writeFileSync(loansFile, JSON.stringify(data, null, 2), 'utf8');
      }
    }
  } catch {}
}

test('loan service: take loan, interest escalation, penalty and repayment', () => {
  const guildId = 'test-guild-loan';
  const userId = 'test-user-loan';

  cleanupTestUser(guildId, userId);

  // 1. Take loan with initial 5% interest
  const takeRes = takeLoan(guildId, userId, 1000);
  assert.equal(takeRes.success, true);
  assert.equal(takeRes.loan.active, true);
  assert.equal(takeRes.loan.principal, 1000);
  assert.equal(takeRes.initialInterest, 50);
  assert.equal(takeRes.loan.balance, 1050); // 1000 principal + 50 initial opening interest

  // Cannot take another loan while active
  const takeDuplicate = takeLoan(guildId, userId, 2000);
  assert.equal(takeDuplicate.success, false);

  // 2. Apply interest ticks and test escalation
  // Tick 1 (5% of 1050 = 53)
  const tick1 = applyInterestTick(guildId, userId);
  assert.equal(tick1.interestAdded, 53);
  assert.equal(tick1.newBalance, 1103);
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

  cleanupTestUser(guildId, userId);
});

test('loan service: hard debt ceiling stops uncontrolled exponential growth', () => {
  const guildId = 'test-guild-ceiling';
  const userId = 'test-user-ceiling';

  cleanupTestUser(guildId, userId);

  takeLoan(guildId, userId, 1000);
  const maxCap = 1000 * MAX_DEBT_MULTIPLIER; // 2500

  // Simulate 30 ticks
  for (let i = 0; i < 30; i++) {
    applyInterestTick(guildId, userId, { force: true });
  }

  const loan = getLoan(guildId, userId);
  assert.equal(loan.balance, maxCap, 'Loan balance must not exceed max debt ceiling');
  assert.equal(loan.penaltyLevel, 3, 'Penalty level must be at level 3 when at ceiling');

  // Applying further tick yields 0 added interest
  const extraTick = applyInterestTick(guildId, userId, { force: true });
  assert.equal(extraTick.interestAdded, 0);
  assert.equal(extraTick.newBalance, maxCap);
  assert.equal(extraTick.isCapped, true);

  cleanupTestUser(guildId, userId);
});

test('loan service: 24-hour time gating and batch processing', () => {
  const guildId = 'test-guild-scheduler';
  const userId = 'test-user-scheduler';

  cleanupTestUser(guildId, userId);

  const startTime = 1000000;
  const takeRes = takeLoan(guildId, userId, 1000, { now: startTime, initialInterestRate: 0 });
  assert.equal(takeRes.success, true);

  // Calling applyInterestTick with force: false before 24h is skipped
  const skippedTick = applyInterestTick(guildId, userId, { force: false, now: startTime + 1000 });
  assert.equal(skippedTick.skipped, true);
  assert.equal(skippedTick.interestAdded, 0);

  // processAllGuildLoans after 1 hour (less than 24h) does not process
  const p1 = processAllGuildLoans(guildId, startTime + (60 * 60 * 1000));
  assert.equal(p1, 0);

  // processAllGuildLoans after 25 hours processes exactly 1 tick
  const p2 = processAllGuildLoans(guildId, startTime + TICK_INTERVAL_MS + 1000);
  assert.equal(p2, 1);

  const loanAfter1Tick = getLoan(guildId, userId);
  assert.equal(loanAfter1Tick.tickCount, 1);
  assert.equal(loanAfter1Tick.balance, 1050);

  // Immediate restart / second run does not duplicate tick
  const p3 = processAllGuildLoans(guildId, startTime + TICK_INTERVAL_MS + 2000);
  assert.equal(p3, 0);

  cleanupTestUser(guildId, userId);
});

test('loan service: partial repayment immediately reduces penalty level', () => {
  const guildId = 'test-guild-penalty';
  const userId = 'test-user-penalty';

  cleanupTestUser(guildId, userId);

  takeLoan(guildId, userId, 1000);

  // Advance loan to ceiling (balance 2500, ratio 2.5, penalty 3)
  for (let i = 0; i < 20; i++) {
    applyInterestTick(guildId, userId, { force: true });
  }
  let loan = getLoan(guildId, userId);
  assert.equal(loan.penaltyLevel, 3);

  // Pay 600 coins -> balance becomes 1900 (ratio 1.9, penalty 1)
  const repay1 = repayLoan(guildId, userId, 600);
  assert.equal(repay1.remaining, 1900);
  assert.equal(repay1.penaltyLevel, 1);

  // Pay 500 coins -> balance becomes 1400 (ratio 1.4, penalty 0)
  const repay2 = repayLoan(guildId, userId, 500);
  assert.equal(repay2.remaining, 1400);
  assert.equal(repay2.penaltyLevel, 0);

  cleanupTestUser(guildId, userId);
});

test('loan service: recordLoanTransfer tracks funds transferred while active', () => {
  const guildId = 'test-guild-transfers';
  const userId = 'test-user-transfers';

  cleanupTestUser(guildId, userId);

  const { recordLoanTransfer } = require('../loanService');
  takeLoan(guildId, userId, 2000);

  const transferRecord = recordLoanTransfer(guildId, userId, 500, 750);
  assert.equal(transferRecord.transferredWithActiveLoan, 500);
  assert.equal(transferRecord.xpPenaltyApplied, 750);

  const summary = getUserLoanSummary(guildId, userId);
  assert.equal(summary.transferredWithActiveLoan, 500);
  assert.equal(summary.xpPenaltyApplied, 750);

  cleanupTestUser(guildId, userId);
});

