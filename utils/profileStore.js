const logger = require('../src/utils/logger');
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');

const dataDir = path.join(__dirname, '..', 'data');
const profilePath = path.join(dataDir, 'profile.json');

function readProfiles() {
  const parsed = readJsonSafe(profilePath, { users: {}, badges: {} });
  if (!parsed || typeof parsed !== 'object') return { users: {}, badges: {} };
  parsed.users = parsed.users || {};
  parsed.badges = parsed.badges || {};
  return parsed;
}

function writeProfiles(obj) {
  fs.mkdirSync(dataDir, { recursive: true });
  writeJsonAtomic(profilePath, obj || { users: {}, badges: {} });

  try {
    const day = new Date().toISOString().slice(0, 10);
    const bname = `profile.backup.${day}.json`;
    const bpath = path.join(dataDir, bname);

    if (!fs.existsSync(bpath) && fs.existsSync(profilePath)) {
      fs.copyFileSync(profilePath, bpath);
      logger.info('[profileStore] Backup creado:', bname);
    }

    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('profile.backup.') && f.endsWith('.json'))
      .sort();
    const toDelete = files.slice(0, Math.max(0, files.length - 7));
    for (const f of toDelete) {
      try { fs.unlinkSync(path.join(dataDir, f)); } catch {}
    }
  } catch {}
}

function ensureUser(profiles, guildId, userId) {
  if (!profiles.users[guildId]) profiles.users[guildId] = {};
  if (!profiles.users[guildId][userId]) {
    profiles.users[guildId][userId] = {
      title: '',
      accent: '#e94560',
      bgUrl: '',
      equippedBadges: [],
      earnedBadges: [],
      streakDays: 0,
      lastActiveDay: 0,
      dailyStreak: 0,
      lastDailyDay: 0,
      lastStreakReminderDay: 0
    };
  }
  const u = profiles.users[guildId][userId];
  if (typeof u.dailyStreak !== 'number') u.dailyStreak = 0;
  if (typeof u.lastDailyDay !== 'number') u.lastDailyDay = 0;
  if (typeof u.lastStreakReminderDay !== 'number') u.lastStreakReminderDay = 0;
  if (!u.xpBoostsActive) u.xpBoostsActive = [];
  if (!u.xpBoostsQueue) u.xpBoostsQueue = [];
  const now = Date.now();
  // Si no hay boost activo pero hay en cola, activar el siguiente automáticamente
  u.xpBoostsActive = u.xpBoostsActive.filter(b => b.expiresAt > now);
  if (u.xpBoostsActive.length === 0 && u.xpBoostsQueue.length > 0) {
    const next = u.xpBoostsQueue.shift();
    u.xpBoostsActive.push({ id: next.id, multiplier: next.multiplier, expiresAt: now + next.durationMs });
  }
  return u;
}

module.exports = { readProfiles, writeProfiles, ensureUser };