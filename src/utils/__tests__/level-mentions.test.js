const test = require('node:test');
const assert = require('node:assert/strict');
const { levelUpAllowedMentions } = require('../levelMentions');

test('avisos de nivel: nunca notifican roles ni parsean menciones', () => {
  const m = levelUpAllowedMentions('123456789012345678');
  assert.deepEqual(m.parse, []);
  assert.deepEqual(m.roles, []);
  assert.deepEqual(m.users, ['123456789012345678']);
});

test('avisos de nivel: un id inválido no abre menciones', () => {
  assert.deepEqual(levelUpAllowedMentions('@everyone').users, []);
  assert.deepEqual(levelUpAllowedMentions(undefined).users, []);
});
