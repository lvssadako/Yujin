const fs = require('node:fs');
const path = require('node:path');
const { readJsonSafe, writeJsonAtomic } = require('../../../utils/jsonStore');
const { readProfiles, ensureUser } = require('../../../utils/profileStore');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

function asSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function readLevels() {
  const parsed = readJsonSafe(levelsPath, { guilds: {} });
  if (!parsed || typeof parsed !== 'object') {
    return { guilds: {} };
  }
  parsed.guilds = parsed.guilds || {};
  return parsed;
}

function writeLevels(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  writeJsonAtomic(levelsPath, data || { guilds: {} });
}

function getUserData(levels, guildId, userId) {
  if (!levels.guilds) levels.guilds = {};
  if (!levels.guilds[guildId]) levels.guilds[guildId] = {};
  if (!levels.guilds[guildId][userId]) {
    levels.guilds[guildId][userId] = { xp: 0, level: 0, messages: 0, voiceMs: 0 };
  }

  const userData = levels.guilds[guildId][userId];
  if (userData.voiceMs == null) {
    if (userData.voiceTime != null) {
      userData.voiceMs = Number(userData.voiceTime) >= 3600000 ? Number(userData.voiceTime) : Number(userData.voiceTime) * 1000;
      delete userData.voiceTime;
    } else if (userData.voiceMinutes != null) {
      userData.voiceMs = Number(userData.voiceMinutes) * 60000;
      delete userData.voiceMinutes;
    } else {
      userData.voiceMs = 0;
    }
  }

  userData.xp = asSafeNumber(userData.xp, 0);
  userData.level = asSafeNumber(userData.level, 0);
  userData.messages = asSafeNumber(userData.messages, 0);
  userData.voiceMs = asSafeNumber(userData.voiceMs, 0);
  return userData;
}

function xpToNext(level) {
  return Math.round(200 * Math.pow((level || 0) + 1, 1.4));
}

function getXpMultiplier(guildId, userId) {
  const profiles = readProfiles();
  const user = ensureUser(profiles, guildId, userId);
  if (user.xpBoostsActive && user.xpBoostsActive.length > 0) {
    return Number(user.xpBoostsActive[0].multiplier) || 1;
  }
  return 1;
}

function addXp(guildId, userId, baseXp) {
  const levels = readLevels();
  const data = getUserData(levels, guildId, userId);
  const multiplier = getXpMultiplier(guildId, userId);
  const gained = Math.floor(asSafeNumber(baseXp, 0) * multiplier);

  data.xp = (data.xp || 0) + gained;
  while (data.xp >= xpToNext(data.level)) {
    data.xp -= xpToNext(data.level);
    data.level = (data.level || 0) + 1;
  }

  writeLevels(levels);
  return { gained, multiplier, level: data.level, xp: data.xp };
}

const levelService = {
  readLevels,
  writeLevels,
  getUserData,
  xpToNext,
  getXpMultiplier,
  addXp
};

module.exports = { levelService };
