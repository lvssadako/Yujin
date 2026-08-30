const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schemaPath = path.join(__dirname, '..', 'src', 'utils', 'config', 'schema.js');
const loaderPath = path.join(__dirname, '..', 'src', 'utils', 'config', 'loader.js');

const tempDir = path.join(__dirname, '.tmp-config');

function makeConfig(overrides = {}) {
  return {
    token: 'abc',
    clientId: '123456789',
    guildId: '987654321',
    boostChannelId: '111',
    levelUpChannelId: '222',
    roleXpBonuses: { '111': 0.5 },
    statusRoleTriggers: [{ field: 'status', includes: '.gg/lco', roleId: '333' }],
    ...overrides
  };
}

test('config schema accepts valid config object', async () => {
  const { validateConfig } = require(loaderPath);
  const config = makeConfig();

  assert.doesNotThrow(() => validateConfig(config));
});

test('config schema rejects invalid roleXpBonuses values', async () => {
  const { validateConfig } = require(loaderPath);
  const config = makeConfig({ roleXpBonuses: { '111': 99 } });

  assert.throws(() => validateConfig(config), /roleXpBonuses|multiplier|between/i);
});

test('config loader reads and validates JSON file content', async () => {
  const { loadAndValidateConfig } = require(loaderPath);

  fs.mkdirSync(tempDir, { recursive: true });
  const filePath = path.join(tempDir, 'valid-config.json');
  fs.writeFileSync(filePath, JSON.stringify(makeConfig()), 'utf8');

  const loaded = loadAndValidateConfig(filePath);
  assert.equal(loaded.token, 'abc');
  assert.equal(loaded.guildId, '987654321');

  fs.rmSync(tempDir, { recursive: true, force: true });
});
