const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const timersPath = path.join(__dirname, '..', 'data', 'bump_timers.json');
const backup = fs.existsSync(timersPath) ? fs.readFileSync(timersPath, 'utf8') : null;

function restore() {
  if (backup === null) {
    if (fs.existsSync(timersPath)) fs.unlinkSync(timersPath);
    return;
  }
  fs.writeFileSync(timersPath, backup, 'utf8');
}

test('addTimer should replace duplicate bump reminders for the same guild/user', () => {
  fs.writeFileSync(timersPath, '[]', 'utf8');

  const { addTimer, readTimers } = require('../utils/bumpTimers');

  addTimer({ id: 'old', guildId: 'guild-1', channelId: 'channel-1', roleId: 'role-1', userId: 'user-1', sendAt: 1000 });
  addTimer({ id: 'new', guildId: 'guild-1', channelId: 'channel-1', roleId: 'role-1', userId: 'user-1', sendAt: 2000 });

  const timers = readTimers();
  assert.equal(timers.length, 1);
  assert.equal(timers[0].id, 'new');

  restore();
});

test.after(() => {
  restore();
});
