const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');
const { STREAK_ACTIVATION_DAYS, STREAK_PREFS_VERSION } = require('../constants/streakRules');

const dataDir = path.join(__dirname, '..', '..', 'data');
const profilePath = path.join(dataDir, 'profile.json');

function readProfiles() {
  const parsed = readJsonSafe(profilePath, { users: {}, badges: {}, globalUsers: {} });
  if (!parsed || typeof parsed !== 'object') return { users: {}, badges: {}, globalUsers: {} };
  parsed.users = parsed.users || {};
  parsed.badges = parsed.badges || {};
  parsed.globalUsers = parsed.globalUsers || {};
  return parsed;
}

function writeProfiles(obj) {
  fs.mkdirSync(dataDir, { recursive: true });
  writeJsonAtomic(profilePath, obj || { users: {}, badges: {}, globalUsers: {} });

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

/**
 * Validación única para perfiles creados antes de que la racha exigiera
 * STREAK_ACTIVATION_DAYS días. Solo quien YA tenía una racha activa (>= 5 días)
 * conserva su configuración de avisos de racha por DM; al resto se le
 * devuelve el valor por defecto (apagado) aunque los hubiera activado antes.
 * Es idempotente: se marca con u.streakPrefsVersion.
 * @returns {boolean} true si el perfil se modificó
 */
function applyStreakPrefsValidation(u) {
  if (!u || typeof u !== 'object') return false;
  if (Number(u.streakPrefsVersion) >= STREAK_PREFS_VERSION) return false;

  const hadActiveStreak = !u.streakDisabled && (Number(u.streakDays) || 0) >= STREAK_ACTIVATION_DAYS;
  if (!hadActiveStreak) {
    delete u.streakAlertsDisabled;
    if (u.dmNotifications && typeof u.dmNotifications === 'object') {
      u.dmNotifications.streaks = false;
    }
  }

  u.streakPrefsVersion = STREAK_PREFS_VERSION;
  return true;
}

/**
 * Aplica la validación a todos los perfiles guardados y persiste si hubo cambios.
 * @returns {{ checked: number, migrated: number, kept: number, reset: number }}
 */
function migrateStreakPreferences() {
  const profiles = readProfiles();
  const result = { checked: 0, migrated: 0, kept: 0, reset: 0 };

  for (const guildUsers of Object.values(profiles.users || {})) {
    if (!guildUsers || typeof guildUsers !== 'object') continue;
    for (const u of Object.values(guildUsers)) {
      result.checked++;
      const wasActive = u && !u.streakDisabled && (Number(u.streakDays) || 0) >= STREAK_ACTIVATION_DAYS;
      if (applyStreakPrefsValidation(u)) {
        result.migrated++;
        if (wasActive) result.kept++;
        else result.reset++;
      }
    }
  }

  if (result.migrated > 0) {
    writeProfiles(profiles);
    logger.info('[profileStore] Validación de preferencias de racha aplicada', result);
  }
  return result;
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
  applyStreakPrefsValidation(u);
  if (!u.dmNotifications || typeof u.dmNotifications !== 'object') {
    u.dmNotifications = {
      all: true,
      streaks: u.streakAlertsDisabled === false,
      warns: true,
      levels: true,
      boosts: true,
      badges: true
    };
  }
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

function ensureGlobalUser(profiles, userId) {
  if (!profiles.globalUsers) profiles.globalUsers = {};
  if (!profiles.globalUsers[userId]) {
    profiles.globalUsers[userId] = {
      streakBgUrl: '',
      streakBgOpacity: 0.65,
      streakAccent: '',
      streakTemplate: 'none'
    };
  }
  const g = profiles.globalUsers[userId];
  if (typeof g.streakBgOpacity !== 'number') g.streakBgOpacity = 0.65;
  if (typeof g.streakTemplate !== 'string') g.streakTemplate = 'none';
  if (typeof g.streakBgUrl !== 'string') g.streakBgUrl = '';
  if (typeof g.streakAccent !== 'string') g.streakAccent = '';
  return g;
}

module.exports = {
  readProfiles,
  writeProfiles,
  ensureUser,
  ensureGlobalUser,
  applyStreakPrefsValidation,
  migrateStreakPreferences
};