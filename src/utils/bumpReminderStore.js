const path = require('node:path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');

const filePath = path.join(__dirname, '..', '..', 'data', 'bump_reminder.json');

function isSnowflake(value) {
  return typeof value === 'string' && /^\d{1,25}$/.test(value);
}

function readStore() {
  const data = readJsonSafe(filePath, {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function getBumpReminder(guildId) {
  if (!isSnowflake(guildId)) return null;

  const reminder = readStore()[guildId];
  if (!reminder || !isSnowflake(reminder.channelId) || !isSnowflake(reminder.roleId)) return null;

  return { channelId: reminder.channelId, roleId: reminder.roleId };
}

function setBumpReminder(guildId, channelId, roleId) {
  if (!isSnowflake(guildId) || !isSnowflake(channelId) || !isSnowflake(roleId)) {
    throw new TypeError('Invalid guild, channel or role identifier');
  }

  const data = readStore();
  data[guildId] = { channelId, roleId };
  writeJsonAtomic(filePath, data);
}

module.exports = { getBumpReminder, setBumpReminder };
