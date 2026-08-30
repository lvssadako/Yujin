const test = require('node:test');
const assert = require('node:assert/strict');

test('streak command should exist and register as a slash command', () => {
  const streakCommand = require('../../commands/level/streak');

  assert.ok(streakCommand);
  assert.equal(streakCommand.data.name, 'streak');
  assert.equal(typeof streakCommand.execute, 'function');
});
