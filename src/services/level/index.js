const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { readProfiles, ensureUser } = require('../../utils/profileStore');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

function getDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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

  // Migración de voz legacy
  if (userData.voiceMs == null) {
    if (userData.voiceTime != null) {
      const vt = Number(userData.voiceTime);
      userData.voiceMs = vt >= 3600000 ? vt : vt * 1000;
      delete userData.voiceTime;
    } else if (userData.voiceMinutes != null) {
      userData.voiceMs = userData.voiceMinutes * 60000;
      delete userData.voiceMinutes;
    } else {
      userData.voiceMs = 0;
    }
  }

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
  const allLevels = levels || readLevels();
  const guildData = allLevels.guilds?.[guildId] || allLevels[guildId] || {};
  const sorted = Object.entries(guildData)
    .filter(([id]) => {
      if (guild) {
        const member = guild.members?.cache?.get(id);
        const user = guild.client?.users?.cache?.get(id) || member?.user;
        if (user?.bot) return false;
      }
      return true;
    })
    .map(([id, data]) => ({ id, level: data.level || 0, xp: data.xp || 0 }))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return b.xp - a.xp;
    });
  const idx = sorted.findIndex(u => u.id === userId);
  return idx >= 0 ? idx + 1 : null;
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
  const levels = readLevels();
  const guildData = levels.guilds?.[guildId] || levels[guildId] || {};
  const currentDay = getDayKey();
  const currentWeek = getWeekKey();

  const entries = Object.entries(guildData)
    .filter(([id]) => {
      if (guild) {
        const member = guild.members?.cache?.get(id);
        const user = guild.client?.users?.cache?.get(id) || member?.user;
        if (user?.bot) return false;
      }
      return true;
    })
    .map(([id, raw]) => {
    const d = { ...raw };
    const daily = (d.daily && d.daily.day === currentDay) ? d.daily : { xp: 0, textXp: 0, voiceXp: 0, messages: 0, voiceMs: 0 };
    const weekly = (d.weekly && d.weekly.week === currentWeek) ? d.weekly : { xp: 0, textXp: 0, voiceXp: 0, messages: 0, voiceMs: 0 };

    let score = 0;
    let detail = '';

    if (timeframe === 'daily') {
      if (category === 'text') {
        score = daily.textXp || 0;
        detail = `${daily.messages || 0} msgs • ${score.toLocaleString()} XP`;
      } else if (category === 'voice') {
        score = daily.voiceXp || 0;
        const mins = Math.floor((daily.voiceMs || 0) / 60000);
        detail = `${mins} min • ${score.toLocaleString()} XP`;
      } else {
        score = daily.xp || 0;
        detail = `${score.toLocaleString()} XP hoy`;
      }
    } else if (timeframe === 'weekly') {
      if (category === 'text') {
        score = weekly.textXp || 0;
        detail = `${weekly.messages || 0} msgs • ${score.toLocaleString()} XP`;
      } else if (category === 'voice') {
        score = weekly.voiceXp || 0;
        const mins = Math.floor((weekly.voiceMs || 0) / 60000);
        detail = `${mins} min • ${score.toLocaleString()} XP`;
      } else {
        score = weekly.xp || 0;
        detail = `${score.toLocaleString()} XP esta semana`;
      }
    } else { // global
      if (category === 'text') {
        score = d.textXp || d.messages || 0;
        detail = `${d.messages || 0} msgs • ${(d.textXp || 0).toLocaleString()} XP`;
      } else if (category === 'voice') {
        score = d.voiceXp || d.voiceMs || 0;
        const mins = Math.floor((d.voiceMs || 0) / 60000);
        detail = `${mins} min • ${(d.voiceXp || 0).toLocaleString()} XP`;
      } else {
        score = (d.level || 0) * 1_000_000 + (d.xp || 0);
        detail = `Nivel ${d.level || 0} • ${(d.xp || 0).toLocaleString()} XP`;
      }
    }

    return {
      id,
      level: d.level || 0,
      xp: d.xp || 0,
      score,
      detail,
      timeframe,
      category,
      messages: d.messages || 0,
      voiceMs: d.voiceMs || 0,
      textXp: d.textXp || 0,
      voiceXp: d.voiceXp || 0,
      daily,
      weekly
    };
  });

  return entries
    .filter(e => e.score > 0 || timeframe === 'global')
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
  getDayKey,
  getWeekKey
};

module.exports = { levelService };
