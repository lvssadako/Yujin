const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { readProfiles, ensureUser } = require('../../utils/profileStore');

const { buildLeaderboard, voiceMilliseconds, selectCurrentMembers } = require('./ranking');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function readLevels() {
  const parsed = readJsonSafe(levelsPath, { guilds: {} });
  if (!parsed || typeof parsed !== 'object') return { guilds: {} };
  parsed.guilds = parsed.guilds || {};
  return parsed;
}

function writeLevels(data) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    writeJsonAtomic(levelsPath, data || { guilds: {} });

    try {
      const day = getDayKey();
      const backupName = `levels.backup.${day}.json`;
      const backupPath = path.join(dataDir, backupName);

      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(levelsPath, backupPath);
        logger.info(`[levelService] Backup creado: ${backupName}`);
      }

      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('levels.backup.') && f.endsWith('.json'))
        .sort();

      const toDelete = files.slice(0, Math.max(0, files.length - 7));
      for (const f of toDelete) {
        try {
          fs.unlinkSync(path.join(dataDir, f));
        } catch {}
      }
    } catch {}
  } catch (err) {
    logger.error('[levelService] Error escribiendo levels.json:', err.message);
    throw err;
  }
}

function getUserData(levels, guildId, userId) {
  if (!levels.guilds) levels.guilds = {};
  if (!levels.guilds[guildId]) levels.guilds[guildId] = {};
  
  if (!levels.guilds[guildId][userId] && levels[guildId]?.[userId]) {
    levels.guilds[guildId][userId] = levels[guildId][userId];
    logger.info(`[levelService] Auto-migrado usuario ${userId} de estructura vieja`);
  }
  
  const currentDay = getDayKey();
  const currentWeek = getWeekKey();

  if (!levels.guilds[guildId][userId]) {
    levels.guilds[guildId][userId] = { 
      xp: 0, 
      level: 0, 
      messages: 0, 
      voiceMs: 0,
      textXp: 0,
      voiceXp: 0,
      daily: { day: currentDay, xp: 0, textXp: 0, voiceXp: 0, messages: 0, voiceMs: 0 },
      weekly: { week: currentWeek, xp: 0, textXp: 0, voiceXp: 0, messages: 0, voiceMs: 0 }
    };
  }
  
  const userData = levels.guilds[guildId][userId];

  // Legacy voiceTime is recorded in seconds by the voice event.
  userData.voiceMs = voiceMilliseconds(userData);

  userData.textXp = userData.textXp || 0;
  userData.voiceXp = userData.voiceXp || 0;

  // Auto-rotación y reset de contadores temporales
  if (!userData.daily || userData.daily.day !== currentDay) {
    userData.daily = { day: currentDay, xp: 0, textXp: 0, voiceXp: 0, messages: 0, voiceMs: 0 };
  }

  if (!userData.weekly || userData.weekly.week !== currentWeek) {
    userData.weekly = { week: currentWeek, xp: 0, textXp: 0, voiceXp: 0, messages: 0, voiceMs: 0 };
  }
  
  return userData;
}

const ensureUserData = getUserData;

function addVoiceTime(guildId, userId, ms) {
  const levels = readLevels();
  const userData = getUserData(levels, guildId, userId);
  userData.voiceMs = (userData.voiceMs || 0) + ms;
  userData.daily.voiceMs = (userData.daily.voiceMs || 0) + ms;
  userData.weekly.voiceMs = (userData.weekly.voiceMs || 0) + ms;
  writeLevels(levels);
  return userData;
}

function addMessageCount(guildId, userId) {
  const levels = readLevels();
  const userData = getUserData(levels, guildId, userId);
  userData.messages = (userData.messages || 0) + 1;
  userData.daily.messages = (userData.daily.messages || 0) + 1;
  userData.weekly.messages = (userData.weekly.messages || 0) + 1;
  writeLevels(levels);
  return userData;
}

function getUserRank(guildId, userId, levels, guild = null) {
  const entries = buildLeaderboard(levels || readLevels(), guildId, 'global', 'general',
    Infinity, guild, getDayKey(), getWeekKey());
  const index = entries.findIndex(entry => entry.id === userId);
  return index >= 0 ? index + 1 : null;
}

function xpToNext(level) {
  return Math.round(200 * Math.pow(level + 1, 1.4));
}

function getXpMultiplier(guildId, userId) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  if (u.xpBoostsActive && u.xpBoostsActive.length > 0) {
    return u.xpBoostsActive[0].multiplier;
  }
  return 1;
}

function addXp(guildId, userId, baseXp, source = 'text') {
  const levels = readLevels();
  const data = ensureUserData(levels, guildId, userId);
  const mult = getXpMultiplier(guildId, userId);
  const gained = Math.floor(baseXp * mult);
  
  data.xp = (data.xp || 0) + gained;

  if (source === 'voice') {
    data.voiceXp = (data.voiceXp || 0) + gained;
    data.daily.voiceXp = (data.daily.voiceXp || 0) + gained;
    data.weekly.voiceXp = (data.weekly.voiceXp || 0) + gained;
  } else {
    data.textXp = (data.textXp || 0) + gained;
    data.daily.textXp = (data.daily.textXp || 0) + gained;
    data.weekly.textXp = (data.weekly.textXp || 0) + gained;
  }

  data.daily.xp = (data.daily.xp || 0) + gained;
  data.weekly.xp = (data.weekly.xp || 0) + gained;
  
  let leveledUp = false;
  let leveledUpCount = 0;
  while (data.xp >= xpToNext(data.level)) {
    data.xp -= xpToNext(data.level);
    data.level = (data.level || 0) + 1;
    leveledUp = true;
    leveledUpCount++;
  }
  
  writeLevels(levels);
  return { gained, multiplier: mult, level: data.level, xp: data.xp, leveledUp, leveledUpCount };
}

function removeXp(guildId, userId, amount) {
  const levels = readLevels();
  const data = ensureUserData(levels, guildId, userId);
  const penalty = Math.max(0, Math.floor(Number(amount) || 0));
  if (penalty <= 0) {
    return { deducted: 0, level: data.level, xp: data.xp, levelsLost: 0 };
  }

  let remainingPenalty = penalty;
  let levelsLost = 0;

  while (remainingPenalty > 0) {
    if (data.xp >= remainingPenalty) {
      data.xp -= remainingPenalty;
      remainingPenalty = 0;
    } else {
      remainingPenalty -= data.xp;
      if (data.level > 0) {
        data.level -= 1;
        levelsLost++;
        data.xp = xpToNext(data.level);
      } else {
        data.xp = 0;
        remainingPenalty = 0;
      }
    }
  }

  writeLevels(levels);
  return { deducted: penalty, level: data.level, xp: data.xp, levelsLost };
}

const penalizeXp = removeXp;

function getLeaderboard(guildId, timeframe = 'global', category = 'general', limit = 10, guild = null) {
  return buildLeaderboard(readLevels(), guildId, timeframe, category, limit, guild, getDayKey(), getWeekKey());
}

async function getGuildLeaderboard(guild, timeframe = 'global', category = 'general', limit = 10) {
  const entries = getLeaderboard(guild.id, timeframe, category, Infinity, guild);
  return selectCurrentMembers(entries, guild, limit);
}

const levelService = {
  readLevels,
  writeLevels,
  getUserData,
  ensureUserData,
  getUserRank,
  xpToNext,
  addVoiceTime,
  addMessageCount,
  getXpMultiplier,
  addXp,
  removeXp,
  penalizeXp,
  getLeaderboard,
  getGuildLeaderboard,
  getDayKey,
  getWeekKey
};

module.exports = { levelService };
