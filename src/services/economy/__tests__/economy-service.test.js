const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createEconomyService } = require('../index');

function makeService() {
  const tempPath = path.join(__dirname, '.tmp-economy.json');
  fs.writeFileSync(tempPath, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
  return createEconomyService({ economyPath: tempPath });
}

test('economy service adds coins and returns updated balance', () => {
  const service = makeService();
  const guildId = 'service-test-guild';
  const userId = 'service-test-user';

  const before = service.getBalance(guildId, userId);
  const updated = service.addCoins(guildId, userId, 150);
  const after = service.getBalance(guildId, userId);

  assert.equal(updated, before.coins + 150);
  assert.equal(after.coins, before.coins + 150);

  fs.unlinkSync(path.join(__dirname, '.tmp-economy.json'));
});

test('economy service can remove coins when enough balance exists', () => {
  const service = makeService();
  const guildId = 'service-test-guild-2';
  const userId = 'service-test-user-2';

  service.addCoins(guildId, userId, 100);
  const removed = service.removeCoins(guildId, userId, 40);
  const balance = service.getBalance(guildId, userId);

  assert.equal(removed, true);
  assert.equal(balance.coins, 60);

  fs.unlinkSync(path.join(__dirname, '.tmp-economy.json'));
});

test('economy service supports subtractCoins, gems and bank operations', () => {
  const service = makeService();
  const guildId = 'service-test-guild-3';
  const userId = 'service-test-user-3';

  service.addCoins(guildId, userId, 500);
  assert.equal(service.subtractCoins(guildId, userId, 200), true);
  assert.equal(service.getBalance(guildId, userId).coins, 300);

  // Bank
  service.addBank(guildId, userId, 1000);
  assert.equal(service.getBalance(guildId, userId).bank, 1000);
  assert.equal(service.removeBank(guildId, userId, 400), true);
  assert.equal(service.getBalance(guildId, userId).bank, 600);

  // Gems
  service.addGems(guildId, userId, 50);
  assert.equal(service.getBalance(guildId, userId).gems, 50);
  assert.equal(service.removeGems(guildId, userId, 20), true);
  assert.equal(service.getBalance(guildId, userId).gems, 30);

  fs.unlinkSync(path.join(__dirname, '.tmp-economy.json'));
});
