const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const loggerPath = path.join(__dirname, '..', 'index.js');

test('logger module is available and exposes standard log methods', async () => {
  const logger = require(loggerPath);

  assert.ok(logger && typeof logger.info === 'function');
  assert.ok(typeof logger.warn === 'function');
  assert.ok(typeof logger.error === 'function');
  assert.ok(typeof logger.debug === 'function');
});

test('logger can emit a structured info message without throwing', async () => {
  const logger = require(loggerPath);

  assert.doesNotThrow(() => {
    logger.info('test message', { test: true, scope: 'unit' });
  });
});
