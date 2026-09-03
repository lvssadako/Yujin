const { readProfiles, writeProfiles, ensureUser, ensureGlobalUser } = require('../../utils/profileStore');
const { getInventory, removeItem, addCoins } = require('../economy').economyService;
const { STREAK_TEMPLATES } = require('../../constants/streakThemes');
const { readConfig } = require('../../utils/configCache');
const logger = require('../../utils/logger');

const FLAME_TIERS = [
  { minDays: 60, name: 'Fénix Legendario', emoji: '👑', color: 0xFF4500, xpMultiplier: 1.35, shopDiscount: 25, badge: '🔥 Fénix Eterno', rewardCoins: 50000 },
  { minDays: 30, name: 'Fuego Cósmico', emoji: '🌟', color: 0x9B59B6, xpMultiplier: 1.25, shopDiscount: 20, badge: '🌟 Llama Cósmica', rewardCoins: 15000 },
  { minDays: 14, name: 'Llama Diamante', emoji: '💎', color: 0x3498DB, xpMultiplier: 1.15, shopDiscount: 15, badge: '💎 Fuego Puro', rewardCoins: 5000 },
  { minDays: 7,  name: 'Fuego Vivo', emoji: '🔥', color: 0xE67E22, xpMultiplier: 1.10, shopDiscount: 10, badge: '🔥 Racha 7D', rewardCoins: 1500 },
  { minDays: 3,  name: 'Llama Eléctrica', emoji: '⚡', color: 0xF1C40F, xpMultiplier: 1.05, shopDiscount: 0, badge: null, rewardCoins: 500 },
  { minDays: 1,  name: 'Chispa Inicial', emoji: '🕯️', color: 0x95A5A6, xpMultiplier: 1.00, shopDiscount: 0, badge: null, rewardCoins: 0 }
];

function getFlameTier(streakDays) {
  const days = Math.max(0, Number(streakDays) || 0);
  for (const tier of FLAME_TIERS) {
    if (days >= tier.minDays) return tier;
  }
  return { minDays: 0, name: 'Sin Racha', emoji: '💤', color: 0x2F3136, xpMultiplier: 1.00, shopDiscount: 0, badge: null, rewardCoins: 0 };
}

function getNextTier(streakDays) {
  const days = Math.max(0, Number(streakDays) || 0);
  const tiersAsc = [...FLAME_TIERS].reverse();
  for (const tier of tiersAsc) {
    if (tier.minDays > days) return tier;
  }
  return null;
}

function getLocalDayInfo() {
  const cfg = readConfig();
  const tz = cfg.timezone || 0;
  const now = Date.now();
  const today = Math.floor((now + tz * 3600000) / 86400000);
  const nextMidnight = (today + 1) * 86400000 - tz * 3600000;
  const midnightTs = Math.floor(nextMidnight / 1000);
  const msRemaining = Math.max(0, nextMidnight - now);
  return { today, midnightTs, msRemaining, tz };
}

function recordMessageActivity(guildId, userId) {
  if (!guildId || !userId) return { updated: false };
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  const { today } = getLocalDayInfo();

  if (u.lastActiveDay === today && !u.streakDisabled) {
    return { updated: false, streakDays: u.streakDays || 0, isNewDay: false, alertsDisabled: Boolean(u.streakAlertsDisabled) };
  }

  const wasDisabled = Boolean(u.streakDisabled);
  const previousStreak = Number(u.streakDays) || 0;
  const isConsecutive = !wasDisabled && u.lastActiveDay === (today - 1);
  let savedByFreeze = false;
  let newStreak = 1;

  if (wasDisabled) {
    // Racha previamente deshabilitada por inactividad (>=15 días): se reactiva desde día 1
    newStreak = 1;
    u.streakDisabled = false;
    delete u.streakDisabledReason;
    delete u.streakPausedAt;
    logger.info(`[streak] Racha reactivada para ${userId} en ${guildId} tras enviar mensaje.`);
  } else if (isConsecutive) {
    newStreak = previousStreak + 1;
  } else if (previousStreak > 0) {
    const inv = getInventory(guildId, userId);
    if (inv && (inv['congelador'] || 0) > 0) {
      removeItem(guildId, userId, 'congelador', 1);
      savedByFreeze = true;
      newStreak = previousStreak + 1;
      logger.info(`[streak] Congelador utilizado por ${userId} en ${guildId}. Racha preservada: ${newStreak}`);
    } else {
      newStreak = 1;
    }
  }

  u.streakDays = newStreak;
  u.lastActiveDay = today;

  const prevTier = getFlameTier(previousStreak);
  const newTier = getFlameTier(newStreak);
  const tierUpgraded = (isConsecutive || savedByFreeze) && (newTier.minDays > prevTier.minDays);

  let coinsRewarded = 0;
  if (tierUpgraded && newTier.rewardCoins > 0) {
    addCoins(guildId, userId, newTier.rewardCoins);
    coinsRewarded = newTier.rewardCoins;
  }

  writeProfiles(profiles);

  return {
    updated: true,
    streakDays: newStreak,
    previousStreak,
    isConsecutive,
    savedByFreeze,
    wasReset: !isConsecutive && !savedByFreeze && previousStreak > 0 && !wasDisabled,
    wasReactivated: wasDisabled,
    tierUpgraded,
    coinsRewarded,
    tier: newTier,
    alertsDisabled: Boolean(u.streakAlertsDisabled)
  };
}

function getUserStreakStatus(guildId, userId) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  const g = ensureGlobalUser(profiles, userId);
  const { today, midnightTs, msRemaining } = getLocalDayInfo();

  const isStreakDisabled = Boolean(u.streakDisabled);
  const streakDays = isStreakDisabled ? 0 : (Number(u.streakDays) || 0);
  const lastActive = Number(u.lastActiveDay) || 0;
  const isActiveToday = (lastActive === today);
  const currentTier = getFlameTier(streakDays);
  const nextTier = getNextTier(streakDays);
  const daysSinceActive = lastActive > 0 ? (today - lastActive) : 999;

  const inv = getInventory(guildId, userId);
  const freezersCount = Number(inv?.['congelador'] || 0);

  let progressPercent = 100;
  let daysToNext = 0;
  if (nextTier) {
    const range = nextTier.minDays - currentTier.minDays;
    const currentProgress = streakDays - currentTier.minDays;
    progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
    daysToNext = nextTier.minDays - streakDays;
  }

  // Resolver fondo global y tema de acento dinámicamente
  let effectiveBgUrl = '';
  let effectiveAccent = g.streakAccent || '';
  const tplKey = g.streakTemplate || 'none';
  if (tplKey === 'none') {
    effectiveBgUrl = '';
  } else if (STREAK_TEMPLATES[tplKey]) {
    effectiveBgUrl = STREAK_TEMPLATES[tplKey].url;
    if (!effectiveAccent) {
      effectiveAccent = STREAK_TEMPLATES[tplKey].accent;
    }
  } else if (tplKey === 'custom' || g.streakBgUrl) {
    effectiveBgUrl = g.streakBgUrl || '';
  }

  return {
    streakDays,
    lastActiveDay: lastActive,
    isActiveToday,
    currentTier,
    nextTier,
    progressPercent,
    daysToNext,
    midnightTs,
    msRemaining,
    freezersCount,
    alertsDisabled: Boolean(u.streakAlertsDisabled),
    streakDisabled: isStreakDisabled,
    daysSinceActive,
    // Personalización global
    streakBgUrl: effectiveBgUrl,
    streakBgOpacity: typeof g.streakBgOpacity === 'number' ? g.streakBgOpacity : 0.65,
    streakAccent: effectiveAccent,
    streakTemplate: tplKey
  };
}

function setGlobalStreakCustomization(userId, updates = {}) {
  const profiles = readProfiles();
  const g = ensureGlobalUser(profiles, userId);

  if (typeof updates.streakTemplate === 'string') {
    g.streakTemplate = updates.streakTemplate;
    if (updates.streakTemplate !== 'custom') {
      g.streakBgUrl = '';
    }
  }

  if (typeof updates.streakBgUrl === 'string') {
    g.streakBgUrl = updates.streakBgUrl;
    if (updates.streakBgUrl) {
      g.streakTemplate = 'custom';
    }
  }

  if (typeof updates.streakAccent === 'string') {
    g.streakAccent = updates.streakAccent;
  }

  if (typeof updates.streakBgOpacity === 'number') {
    g.streakBgOpacity = updates.streakBgOpacity;
  }

  writeProfiles(profiles);
  return g;
}

function setStreakAlertPreference(guildId, userId, disabled) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  u.streakAlertsDisabled = Boolean(disabled);
  writeProfiles(profiles);
  return u.streakAlertsDisabled;
}

function getStreakLeaderboard(guildId, limit = 10, guild = null) {
  const profiles = readProfiles();
  const guildUsers = profiles.users?.[guildId] || {};
  const { today } = getLocalDayInfo();

  const activeUsers = Object.entries(guildUsers)
    .filter(([userId]) => {
      if (guild) {
        const member = guild.members?.cache?.get(userId);
        const user = guild.client?.users?.cache?.get(userId) || member?.user;
        if (user?.bot) return false;
      }
      return true;
    })
    .map(([userId, data]) => ({
      userId,
      streakDays: data.streakDisabled ? 0 : (Number(data.streakDays) || 0),
      lastActiveDay: Number(data.lastActiveDay) || 0,
      isActiveToday: (data.lastActiveDay === today),
      tier: getFlameTier(data.streakDisabled ? 0 : (data.streakDays || 0)),
      streakDisabled: Boolean(data.streakDisabled)
    }))
    .filter(u => u.streakDays > 0 && !u.streakDisabled)
    .sort((a, b) => b.streakDays - a.streakDays);

  return {
    top: activeUsers.slice(0, limit),
    totalActive: activeUsers.length,
    highestStreak: activeUsers[0]?.streakDays || 0
  };
}

/**
 * Verifica los usuarios que han enviado mensajes en los últimos N días (por defecto 15).
 * Si detecta usuarios que no han escrito en ese periodo, les deshabilita la racha hasta que envíen un mensaje.
 * @param {string} guildId - ID del servidor
 * @param {number} daysThreshold - Límite de días de inactividad (default: 15)
 * @param {boolean} dryRun - Si es true, solo calcula y reporta sin modificar los archivos
 * @returns {object} Resultado del análisis con conteos y lista de usuarios afectados
 */
function checkAndDisableInactiveStreaks(guildId, daysThreshold = 15, dryRun = false) {
  if (!guildId) return { totalChecked: 0, inactiveFound: 0, disabledCount: 0, users: [], thresholdDays: daysThreshold };

  const profiles = readProfiles();
  const guildUsers = profiles.users?.[guildId];
  if (!guildUsers || typeof guildUsers !== 'object') {
    return { totalChecked: 0, inactiveFound: 0, disabledCount: 0, users: [], thresholdDays: daysThreshold };
  }

  const { today } = getLocalDayInfo();
  const threshold = Math.max(1, Number(daysThreshold) || 15);
  const affectedUsers = [];
  let modified = false;

  for (const [userId, u] of Object.entries(guildUsers)) {
    const lastActive = Number(u.lastActiveDay) || 0;
    const currentStreak = Number(u.streakDays) || 0;
    const isAlreadyDisabled = Boolean(u.streakDisabled);

    // Calcular días desde su última actividad registrada
    const daysSinceLastActive = lastActive > 0 ? (today - lastActive) : 999;
    const isInactive = daysSinceLastActive >= threshold;

    if (isInactive) {
      affectedUsers.push({
        userId,
        previousStreak: currentStreak,
        lastActiveDay: lastActive,
        daysSinceLastActive,
        alreadyDisabled: isAlreadyDisabled
      });

      if (!dryRun && (!isAlreadyDisabled || currentStreak > 0)) {
        u.streakDisabled = true;
        u.streakPausedAt = currentStreak;
        u.streakDisabledReason = `inactivity_${threshold}_days`;
        u.streakDays = 0;
        modified = true;
      }
    }
  }

  if (modified && !dryRun) {
    writeProfiles(profiles);
    logger.info(`[streak] Verificación de inactividad ejecutada en ${guildId}: ${affectedUsers.length} usuarios inactivos (>= ${threshold} días).`);
  }

  return {
    totalChecked: Object.keys(guildUsers).length,
    inactiveFound: affectedUsers.length,
    disabledCount: dryRun ? 0 : affectedUsers.filter(u => !u.alreadyDisabled || u.previousStreak > 0).length,
    users: affectedUsers,
    thresholdDays: threshold,
    dryRun: Boolean(dryRun)
  };
}

module.exports = {
  FLAME_TIERS,
  getFlameTier,
  getNextTier,
  getLocalDayInfo,
  recordMessageActivity,
  getUserStreakStatus,
  setGlobalStreakCustomization,
  setStreakAlertPreference,
  getStreakLeaderboard,
  checkAndDisableInactiveStreaks
};
