const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseIds,
  getOwnerIds,
  getDeveloperIds,
  isOwner,
  isDeveloper,
  isOwnerOrDev,
  getStaffRole
} = require('../staffAuth');

test('staffAuth: parseIds formats and trims correctly', () => {
  assert.deepEqual(parseIds('123, 456, 789'), ['123', '456', '789']);
  assert.deepEqual(parseIds('111;222  333'), ['111', '222', '333']);
  assert.deepEqual(parseIds(''), []);
  assert.deepEqual(parseIds(null), []);
  assert.deepEqual(parseIds(undefined), []);
});

test('staffAuth: isOwner, isDeveloper, and isOwnerOrDev authentication', () => {
  const originalOwner = process.env.OWNER_ID;
  const originalDev = process.env.DEVELOPER_ID;

  try {
    process.env.OWNER_ID = '999000111, 888000222';
    process.env.DEVELOPER_ID = '777000333';

    assert.equal(isOwner('999000111'), true);
    assert.equal(isOwner('888000222'), true);
    assert.equal(isOwner('777000333'), false);
    assert.equal(isOwner('123456789'), false);

    assert.equal(isDeveloper('777000333'), true);
    assert.equal(isDeveloper('999000111'), false);

    assert.equal(isOwnerOrDev('999000111'), true);
    assert.equal(isOwnerOrDev('777000333'), true);
    assert.equal(isOwnerOrDev('000000000'), false);

    assert.equal(getStaffRole('999000111'), '👑 Dueño (Owner)');
    assert.equal(getStaffRole('777000333'), '💻 Desarrollador (Developer)');
    assert.equal(getStaffRole('000000000'), null);
  } finally {
    process.env.OWNER_ID = originalOwner;
    process.env.DEVELOPER_ID = originalDev;
  }
});
