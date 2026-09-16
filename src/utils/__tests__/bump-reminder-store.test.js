const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const store = require('../bumpReminderStore');
const filePath = path.join(__dirname, '..', '..', '..', 'data', 'bump_reminder.json');

test('bump reminder store validates identifiers and preserves the configured reminder', t => {
  const existed = fs.existsSync(filePath);
  const previous = existed ? fs.readFileSync(filePath) : null;
  t.after(() => {
    if (existed) fs.writeFileSync(filePath, previous);
    else fs.rmSync(filePath, { force: true });
  });

  store.setBumpReminder('100000000000000001', '200000000000000002', '300000000000000003');
  assert.deepEqual(store.getBumpReminder('100000000000000001'), {
    channelId: '200000000000000002',
    roleId: '300000000000000003'
  });
  assert.equal(store.getBumpReminder('not-a-guild'), null);
  assert.throws(() => store.setBumpReminder('not-a-guild', '2', '3'), /identifier/i);
});
