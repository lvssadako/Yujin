const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JsonDatabaseAdapter = require('../adapters/jsonAdapter');
const EconomyRepository = require('../repositories/economyRepository');

const tempDir = path.join(__dirname, '.tmp-db');

test('JsonDatabaseAdapter performs atomic get, set, delete operations', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const adapter = new JsonDatabaseAdapter({ dataDir: tempDir });

  await adapter.set('test_collection', 'key1', { name: 'Yujin', score: 100 });
  const fetched = await adapter.get('test_collection', 'key1');

  assert.deepEqual(fetched, { name: 'Yujin', score: 100 });

  const deleted = await adapter.delete('test_collection', 'key1');
  assert.equal(deleted, true);

  const afterDelete = await adapter.get('test_collection', 'key1');
  assert.equal(afterDelete, null);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('EconomyRepository manages balances and transactions', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const adapter = new JsonDatabaseAdapter({ dataDir: tempDir });
  const repo = new EconomyRepository(adapter);

  const guildId = 'test-guild-123';
  const userId = 'test-user-456';

  const balanceInit = await repo.getUserBalance(guildId, userId);
  assert.equal(balanceInit.coins, 0);

  await repo.addCoins(guildId, userId, 500);
  const balanceAfterAdd = await repo.getUserBalance(guildId, userId);
  assert.equal(balanceAfterAdd.coins, 500);

  const deducted = await repo.deductCoins(guildId, userId, 200);
  assert.equal(deducted, true);

  const balanceAfterDeduct = await repo.getUserBalance(guildId, userId);
  assert.equal(balanceAfterDeduct.coins, 300);

  const overDeduct = await repo.deductCoins(guildId, userId, 9999);
  assert.equal(overDeduct, false);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
