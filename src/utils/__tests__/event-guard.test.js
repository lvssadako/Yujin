const test = require('node:test');
const assert = require('node:assert/strict');

const { grantOnce, makeRewardKey, clearEventGuard } = require('../utils/eventGuard');

test('grantOnce prevents duplicate execution within TTL', () => {
  let count = 0;

  const first = grantOnce('guild-1', 'user-1', 'boost_reward', 'boost', 5000, () => {
    count += 1;
    return 'ok';
  });

  const second = grantOnce('guild-1', 'user-1', 'boost_reward', 'boost', 5000, () => {
    count += 1;
    return 'dup';
  });

  assert.equal(first, 'ok');
  assert.equal(second, false);
  assert.equal(count, 1);

  clearEventGuard('guild-1', 'user-1', 'boost_reward', 'boost');
});

test('makeRewardKey is stable and consistent', () => {
  const key = makeRewardKey('guild-1', 'user-1', 'bump', 'disboard');
  assert.equal(key, 'guild-1:user-1:bump:disboard');
});
