const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');

const { readProfiles, ensureUser } = require('./profileStore');

const dataDir = path.join(__dirname, '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

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
      const day = new Date().toISOString().slice(0, 10);
      const backupName = `levels.backup.${day}.json`;
      const backupPath = path.join(dataDir, backupName);

      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(levelsPath, backupPath);
        logger.info(`[levelStore] Backup creado: ${backupName}`);
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
    logger.error('[levelStore] Error escribiendo levels.json:', err.message);
  }
}

function getUserData(levels, guildId, userId) {
  if (!levels.guilds) levels.guilds = {};
  if (!levels.guilds[guildId]) levels.guilds[guildId] = {};
  
  // Migración automática desde estructura vieja
  if (!levels.guilds[guildId][userId] && levels[guildId]?.[userId]) {
    levels.guilds[guildId][userId] = levels[guildId][userId];
    logger.info(`[levelStore] Auto-migrado usuario ${userId} de estructura vieja`);
  }
  
  if (!levels.guilds[guildId][userId]) {
    levels.guilds[guildId][userId] = { 
      xp: 0, 
      level: 0, 
      messages: 0, 
      voiceMs: 0  // ✅ Unificado en milisegundos
    };
  }
  
  // ✅ Migración automática de campos viejos
  const userData = levels.guilds[guildId][userId];
  if (userData.voiceMs == null) {
    if (userData.voiceTime != null) {
      const vt = Number(userData.voiceTime);
      // Si >= 3600000 asumimos ms, sino segundos
      userData.voiceMs = vt >= 3600000 ? vt : vt * 1000;
      delete userData.voiceTime;
    } else if (userData.voiceMinutes != null) {
      userData.voiceMs = userData.voiceMinutes * 60000;
      delete userData.voiceMinutes;
    } else {
      userData.voiceMs = 0;
    }
  }
  
  return userData;
}

// ✅ Alias para compatibilidad
const ensureUserData = getUserData;

// ✅ Nueva función para incrementar voz
function addVoiceTime(guildId, userId, ms) {
  const levels = readLevels();
  const userData = getUserData(levels, guildId, userId);
  userData.voiceMs = (userData.voiceMs || 0) + ms;
  writeLevels(levels);
  return userData;
}

// ✅ Nueva función para incrementar voz
function addVoiceTime(guildId, userId, ms) {
  const levels = readLevels();
  const userData = getUserData(levels, guildId, userId);
  userData.voiceMs = (userData.voiceMs || 0) + ms;
  writeLevels(levels);
  return userData;
}

function getUserRank(guildId, userId, levels) {
  const guildData = levels.guilds?.[guildId] || levels[guildId] || {};
  const sorted = Object.entries(guildData)
    .map(([id, data]) => ({ id, level: data.level || 0, xp: data.xp || 0 }))
    .sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level; // primero nivel
      return b.xp - a.xp; // desempate XP
    });
  const idx = sorted.findIndex(u => u.id === userId);
  return idx >= 0 ? idx + 1 : null;
}

// Fórmula ÚNICA para todos los archivos (usa esta)
function xpToNext(level) {
  return Math.round(200 * Math.pow(level + 1, 1.4));
}

// Obtener multiplicador total de XP (solo de boosts comprados, sin roles)
function getXpMultiplier(guildId, userId) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  // Solo el boost activo cuenta
  if (u.xpBoostsActive && u.xpBoostsActive.length > 0) {
    return u.xpBoostsActive[0].multiplier;
  }
  return 1;
}

// Dar XP aplicando multiplicadores de boosts
function addXp(guildId, userId, baseXp) {
  const levels = readLevels();
  const data = ensureUserData(levels, guildId, userId);
  const mult = getXpMultiplier(guildId, userId);
  const gained = Math.floor(baseXp * mult);
  
  data.xp = (data.xp || 0) + gained;
  
  // Level up automático
  while (data.xp >= xpToNext(data.level)) {
    data.xp -= xpToNext(data.level);
    data.level = (data.level || 0) + 1;
  }
  
  writeLevels(levels);
  return { gained, multiplier: mult, level: data.level, xp: data.xp };
}

module.exports = { 
  readLevels, 
  writeLevels, 
  getUserData, 
  ensureUserData,
  getUserRank, 
  xpToNext,
  addVoiceTime,
  getXpMultiplier,
  addXp
};