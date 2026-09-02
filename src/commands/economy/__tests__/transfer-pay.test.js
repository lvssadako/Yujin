const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handleTransfer } = require('../transfer');
const { handleStaffAddMoney } = require('../../admin/addmoney');
const { economyService } = require('../../../services/economy');
const { levelService } = require('../../../services/level');
const { takeLoan, repayLoan, getLoan } = require('../../../services/economy/loanService');

const guildId = 'test-guild-commands-transfer';
const userSender = 'user-sender-101';
const userRecipient = 'user-recipient-202';
const userAdmin = 'user-admin-303';

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

test('handleTransfer: transfers money correctly between users without debt', async () => {
  cleanupTestData();

  economyService.ensureUserEconomy(economyService.readEconomy(), guildId, userSender);
  economyService.ensureUserEconomy(economyService.readEconomy(), guildId, userRecipient);

  economyService.addCoins(guildId, userSender, 2000);
  const initialBalRecipient = economyService.getBalance(guildId, userRecipient).coins;

  // Cannot transfer to self
  const selfRes = await handleTransfer(guildId, userSender, { id: userSender, bot: false }, 500);
  assert.ok(selfRes.error && selfRes.error.includes('no puedes transferirte a ti mismo'));

  // Cannot transfer to bot
  const botRes = await handleTransfer(guildId, userSender, { id: 'bot-99', bot: true }, 500);
  assert.ok(botRes.error && botRes.error.includes('bot'));

  // Cannot transfer more than balance
  const excessiveRes = await handleTransfer(guildId, userSender, { id: userRecipient, bot: false }, 999999);
  assert.ok(excessiveRes.error && excessiveRes.error.includes('insuficientes'));

  // Successful transfer
  const successRes = await handleTransfer(guildId, userSender, { id: userRecipient, bot: false }, 500);
  assert.ok(!successRes.error);
  assert.ok(successRes.embed);

  const finalBalRecipient = economyService.getBalance(guildId, userRecipient).coins;
  assert.equal(finalBalRecipient, initialBalRecipient + 500);
});

test('handleTransfer: applies XP penalty and warning if sender has an active loan', async () => {
  cleanupTestData();

  // Setup user with coins and active loan
  economyService.addCoins(guildId, userSender, 3000);
  levelService.addXp(guildId, userSender, 2000);

  takeLoan(guildId, userSender, 1000);
  const loanBefore = getLoan(guildId, userSender);
  assert.equal(loanBefore.active, true);

  const transferAmount = 600;
  const res = await handleTransfer(guildId, userSender, { id: userRecipient, bot: false }, transferAmount);

  assert.ok(!res.error);
  assert.ok(res.embed);

  // Check that embed contains warning about loan and XP penalty
  const warningField = res.embed.data.fields.find(f => f.name.includes('Advertencia'));
  assert.ok(warningField, 'Must include warning field for loan funds transfer');
  assert.ok(warningField.value.includes('penalización de XP'));

  // Check loan record updated
  const loanAfter = getLoan(guildId, userSender);
  assert.equal(loanAfter.transferredWithActiveLoan, transferAmount);
  assert.ok(loanAfter.xpPenaltyApplied >= 500);

  cleanupTestData();
});

test('handleStaffAddMoney: forbids granting money to oneself and awards money to target', async () => {
  cleanupTestData();

  // Executor tries to give money to themselves
  const selfAddRes = await handleStaffAddMoney(guildId, userAdmin, { id: userAdmin, bot: false }, 1000);
  assert.ok(selfAddRes.error && selfAddRes.error.includes('No puedes otorgarte dinero a ti mismo'));

  // Executor tries to give money to a bot
  const botAddRes = await handleStaffAddMoney(guildId, userAdmin, { id: 'bot-123', bot: true }, 1000);
  assert.ok(botAddRes.error && botAddRes.error.includes('bot'));

  // Successful add money to target
  const balBefore = economyService.getBalance(guildId, userRecipient).coins;
  const successAdd = await handleStaffAddMoney(guildId, userAdmin, { id: userRecipient, bot: false, tag: 'UserRecipient#0001' }, 1500);

  assert.ok(!successAdd.error);
  assert.ok(successAdd.embed);

  const balAfter = economyService.getBalance(guildId, userRecipient).coins;
  assert.equal(balAfter, balBefore + 1500);

  cleanupTestData();
});
