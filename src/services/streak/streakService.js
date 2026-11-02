const { readProfiles, writeProfiles, ensureUser, ensureGlobalUser } = require('../../utils/profileStore');
const { getInventory } = require('../economy').economyService;
const { STREAK_TEMPLATES } = require('../../constants/streakThemes');
const { readConfig } = require('../../utils/configCache');
const logger = require('../../utils/logger');
const path = require('node:path');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { withLock } = require('../economy/economyLock');
const { validId } = require('../economy/loanPaymentStore');
const { DAY_MS, normalizeTimezone, localDay, dayInfo, userTimezone, prepareCalendar } = require('./timezoneService');
const dataDir = path.join(__dirname, '../../../data');
const economyPath = path.join(dataDir, 'economy.json');

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

function getLocalDayInfo(guildId, userId, timestamp = Date.now(), profiles = readProfiles()) {
  const cfg = readConfig();
  return dayInfo(userTimezone(profiles, userId, cfg), timestamp);
}

const ACTIVITY_FIELDS = ['streakDays', 'lastActiveDay', 'lastActiveAt', 'streakDisabled',
  'streakCalendarVersion', 'streakCalendarZone', 'streakNextIncrementAt'];
function wallet(economy, guildId, userId) {
  economy.guilds ??= {};
  economy.guilds[guildId] ??= {};
  const user = economy.guilds[guildId][userId] ??= { coins: 0, gems: 0, bank: 0, inventory: {} };
  if (!Number.isSafeInteger(user.coins) || user.coins < 0) throw new Error('Invalid streak reward wallet');
  user.inventory ??= {};
  return user;
}
function finishActivity(guildId, userId, receipt) {
  if (receipt.version !== 1 || !Number.isSafeInteger(receipt.timestamp) ||
      !Number.isSafeInteger(receipt.state?.streakDays) || receipt.state.streakDays < 0 ||
      receipt.timestamp < 0 || receipt.state.lastActiveAt !== receipt.timestamp ||
      !Number.isSafeInteger(receipt.state.lastActiveDay) || receipt.state.lastActiveDay < 0 ||
      !Number.isSafeInteger(receipt.state.streakNextIncrementAt) || receipt.state.streakNextIncrementAt <= receipt.timestamp ||
      typeof receipt.state.streakDisabled !== 'boolean' || receipt.state.streakCalendarVersion !== 2 ||
      normalizeTimezone(receipt.state.streakCalendarZone) !== receipt.state.streakCalendarZone) throw new Error('Invalid streak activity receipt');
  const profiles = readProfiles(), user = ensureUser(profiles, guildId, userId);
  if ((user.lastActiveAt || 0) <= receipt.timestamp) {
    for (const field of ACTIVITY_FIELDS) user[field] = receipt.state[field];
    if (!user.streakDisabled) { delete user.streakDisabledReason; delete user.streakPausedAt; }
    writeProfiles(profiles);
  }
  const economy = readJsonSafe(economyPath, { guilds: {} });
  const current = wallet(economy, guildId, userId).streakActivity;
  if (!current || current.timestamp !== receipt.timestamp) throw new Error('Streak activity recovery conflict');
  current.complete = true;
  writeJsonAtomic(economyPath, economy);
}
function recoverStreakActivities() {
  return withLock(dataDir, () => {
    const economy = readJsonSafe(economyPath, { guilds: {} });
    let recovered = 0;
    for (const [guildId, users] of Object.entries(economy.guilds || {})) {
      for (const [userId, user] of Object.entries(users)) {
        if (user.streakActivity && !user.streakActivity.complete) {
          finishActivity(guildId, userId, user.streakActivity); recovered++;
        }
      }
    }
    return recovered;
  });
}

function clearStaleInactiveFlag(user, today) {
  const match = /^inactivity_([1-9]\d*)_days$/.exec(user.streakDisabledReason || '');
  const gap = today - user.lastActiveDay;
  if (!user.streakDisabled || !Number.isSafeInteger(user.streakDays) || user.streakDays < 1 ||
      !match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(gap) ||
      gap < 0 || gap > 1 || gap >= Number(match[1])) return false;
  user.streakDisabled = false;
  delete user.streakDisabledReason;
  delete user.streakPausedAt;
  return true;
}

// Offline maintenance entrypoint. The correction and its receipt are in the same
// atomic profile write; it never credits old milestones or replaces user activity.
function restoreHistoricalStreaks(entries, incidentId) {
  if (!validId(incidentId) || !Array.isArray(entries) || entries.length < 1 || entries.length > 5000) {
    throw new Error('Invalid streak restoration plan');
  }
  return withLock(dataDir, () => {
    recoverStreakActivities();
    const profiles = readProfiles(), cfg = readConfig(), timestamp = Date.now(), results = [], seen = new Set();
    for (const entry of entries) {
      const { guildId, userId, lostDays, expectedStreakDays, expectedLastActiveDay } = entry || {};
      const key = guildId + ':' + userId;
      if (!validId(guildId) || !validId(userId) || seen.has(key) ||
          !Number.isSafeInteger(lostDays) || lostDays < 1 ||
          !Number.isSafeInteger(expectedStreakDays) || expectedStreakDays < 0 ||
          !Number.isSafeInteger(expectedLastActiveDay) || expectedLastActiveDay < 1) {
        throw new Error('Invalid streak restoration entry');
      }
      seen.add(key);
      const user = profiles.users?.[guildId]?.[userId];
      if (!user) throw new Error('Streak restoration user is missing');
      const receipts = user.streakRestorations || {};
      if (typeof receipts !== 'object' || Array.isArray(receipts)) throw new Error('Invalid streak restoration receipts');
      if (Object.hasOwn(receipts, incidentId)) {
        const receipt = receipts[incidentId];
        if (receipt?.version !== 1 || receipt.lostDays !== lostDays ||
            !Number.isSafeInteger(receipt.restoredDays) || receipt.restoredDays < 1) {
          throw new Error('Streak restoration receipt conflicts with plan');
        }
        results.push({ guildId, userId, applied: false, previousDays: user.streakDays, restoredDays: user.streakDays });
        continue;
      }
      if (user.streakDays !== expectedStreakDays || user.lastActiveDay !== expectedLastActiveDay) {
        throw new Error('Streak activity changed after restoration was planned');
      }
      const calendarUser = { ...user };
      const calendar = prepareCalendar(calendarUser, userTimezone(profiles, userId, cfg), cfg, timestamp);
      if (calendarUser.streakDisabled || calendarUser.lastActiveDay < calendar.today - 1 ||
          calendarUser.lastActiveDay > calendar.today) throw new Error('Streak is no longer active');
      const restoredDays = user.streakDays + lostDays;
      if (!Number.isSafeInteger(restoredDays)) throw new Error('Streak restoration exceeds counter range');
      receipts[incidentId] = { version: 1, lostDays, previousDays: user.streakDays, restoredDays, restoredAt: timestamp };
      const previousDays = user.streakDays;
      user.streakDays = restoredDays;
      user.streakRestorations = receipts;
      results.push({ guildId, userId, applied: true, previousDays, restoredDays });
    }
    if (results.some(result => result.applied)) writeProfiles(profiles);
    return results;
  });
}

function recordMessageActivity(guildId, userId) {
  if (!validId(guildId) || !validId(userId)) return { updated: false };
  // Most messages are already counted for today's streak. Avoid an economic
  // transaction and midnight search on that path; day transitions recheck under lock.
  const snapshot = readProfiles(), config = readConfig(), current = snapshot.users?.[guildId]?.[userId];
  const zone = userTimezone(snapshot, userId, config);
  if (current?.streakCalendarVersion === 2 && current.streakCalendarZone === zone &&
      !current.streakDisabled && current.lastActiveDay === localDay(zone, Date.now())) {
    return { updated: false, streakDays: current.streakDays || 0, isNewDay: false,
      alertsDisabled: Boolean(current.streakAlertsDisabled) };
  }
  return withLock(dataDir, () => {
    let economy = readJsonSafe(economyPath, { guilds: {} });
    let funds = wallet(economy, guildId, userId);
    if (funds.streakActivity && !funds.streakActivity.complete) {
      finishActivity(guildId, userId, funds.streakActivity);
      economy = readJsonSafe(economyPath, { guilds: {} });
      funds = wallet(economy, guildId, userId);
    }
    const profiles = readProfiles(), u = ensureUser(profiles, guildId, userId), cfg = readConfig(), timestamp = Date.now();
    const calendar = prepareCalendar(u, userTimezone(profiles, userId, cfg), cfg, timestamp);
    const { today } = calendar;
    const repairedInactiveFlag = clearStaleInactiveFlag(u, today);
    if (u.lastActiveDay === today && !u.streakDisabled) {
      if (calendar.changed || repairedInactiveFlag) writeProfiles(profiles);
      return { updated: false, streakDays: u.streakDays || 0, isNewDay: false, alertsDisabled: Boolean(u.streakAlertsDisabled) };
    }
    const wasDisabled = Boolean(u.streakDisabled), previousStreak = Number(u.streakDays) || 0;
    const isConsecutive = !wasDisabled && u.lastActiveDay === today - 1;
    const transition = !wasDisabled && timestamp < (u.streakNextIncrementAt || 0);
    let savedByFreeze = false, newStreak = 1;
    if (transition) newStreak = previousStreak;
    else if (isConsecutive) newStreak = previousStreak + 1;
    else if (!wasDisabled && previousStreak > 0 && (funds.inventory.congelador || 0) > 0) {
      if (!Number.isSafeInteger(funds.inventory.congelador)) throw new Error('Invalid streak freezer quantity');
      funds.inventory.congelador--;
      savedByFreeze = true;
      newStreak = previousStreak + 1;
    }
    u.streakDays = newStreak; u.lastActiveDay = today; u.lastActiveAt = timestamp;
    u.streakDisabled = false;
    u.streakNextIncrementAt = Math.max(transition ? u.streakNextIncrementAt : 0, calendar.midnightMs);
    const prevTier = getFlameTier(previousStreak), newTier = getFlameTier(newStreak);
    const tierUpgraded = !transition && (isConsecutive || savedByFreeze) && newTier.minDays > prevTier.minDays;
    const coinsRewarded = tierUpgraded ? newTier.rewardCoins : 0;
    if (!Number.isSafeInteger(funds.coins + coinsRewarded)) throw new Error('Streak reward exceeds wallet range');
    funds.coins += coinsRewarded;
    // Reward/freezer and the exact activity state are committed together. A profile
    // failure can be recovered without paying the milestone or consuming a freezer twice.
    const receipt = { version: 1, timestamp, complete: false,
      state: Object.fromEntries(ACTIVITY_FIELDS.map(field => [field, u[field]])) };
    funds.streakActivity = receipt;
    writeJsonAtomic(economyPath, economy);
    finishActivity(guildId, userId, receipt);
    return { updated: true, streakDays: newStreak, previousStreak, isConsecutive, savedByFreeze,
      wasReset: !transition && !isConsecutive && !savedByFreeze && previousStreak > 0 && !wasDisabled,
      wasReactivated: wasDisabled, tierUpgraded, coinsRewarded, tier: newTier, alertsDisabled: Boolean(u.streakAlertsDisabled) };
  });
}

function setUserStreakTimezone(userId, input) {
  if (!validId(userId)) throw new Error('Usuario inválido.');
  const timeZone = normalizeTimezone(input);
  return withLock(dataDir, () => {
    recoverStreakActivities();
    const profiles = readProfiles(), cfg = readConfig(), global = ensureGlobalUser(profiles, userId), timestamp = Date.now();
    const oldZone = userTimezone(profiles, userId, cfg);
    if (global.streakTimezone === timeZone) return { changed: false, ...dayInfo(timeZone, timestamp) };
    if (global.streakTimezoneChangedAt && timestamp - global.streakTimezoneChangedAt < DAY_MS) {
      throw new Error('Puedes cambiar tu zona horaria una vez cada 24 horas.');
    }
    for (const [guildId, users] of Object.entries(profiles.users || {})) {
      if (!users[userId]) continue;
      const u = ensureUser(profiles, guildId, userId);
      prepareCalendar(u, oldZone, cfg, timestamp);
      prepareCalendar(u, timeZone, cfg, timestamp);
    }
    global.streakTimezone = timeZone;
    global.streakTimezoneChangedAt = timestamp;
    writeProfiles(profiles);
    return { changed: true, ...dayInfo(timeZone, timestamp) };
  });
}

function markStreakReminderSent(guildId, userId, expectedKey) {
  return withLock(dataDir, () => {
  const profiles = readProfiles(), cfg = readConfig(), user = ensureUser(profiles, guildId, userId);
  const info = prepareCalendar(user, userTimezone(profiles, userId, cfg), cfg, Date.now());
  const key = info.timeZone + ':' + info.today;
  if (key !== expectedKey || user.lastActiveDay === info.today || user.streakDisabled) return false;
  user.lastStreakReminderDay = info.today;
  user.lastStreakReminderKey = key;
  writeProfiles(profiles);
  return true;
  });
}

function getUserStreakStatus(guildId, userId, options = {}) {
  const profiles = options.profiles || readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  const g = ensureGlobalUser(profiles, userId);
  const cfg = readConfig();
  const { today, midnightTs, msRemaining, timeZone } = prepareCalendar(u, userTimezone(profiles, userId, cfg), cfg, options.timestamp ?? Date.now());

  const isStreakDisabled = Boolean(u.streakDisabled);
  const streakDays = isStreakDisabled ? 0 : (Number(u.streakDays) || 0);
  const lastActive = Number(u.lastActiveDay) || 0;
  const isActiveToday = (lastActive === today);
  const currentTier = getFlameTier(streakDays);
  const nextTier = getNextTier(streakDays);
  const daysSinceActive = lastActive > 0 ? (today - lastActive) : 999;

  const inv = options.includeInventory === false ? {} : getInventory(guildId, userId);
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
    streakDays, today, timeZone,
    timezoneConfigured: Boolean(g.streakTimezone),
    reminderKey: timeZone + ':' + today,
    alreadyReminded: u.lastStreakReminderKey === timeZone + ':' + today,
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
  const cfg = readConfig(), timestamp = Date.now();
  const activeUsers = Object.entries(guildUsers)
    .filter(([userId]) => {
      if (guild) {
        const member = guild.members?.cache?.get(userId);
        const user = guild.client?.users?.cache?.get(userId) || member?.user;
        if (user?.bot) return false;
      }
      return true;
    })
    .map(([userId, data]) => {
      const info = prepareCalendar(data, userTimezone(profiles, userId, cfg), cfg, timestamp);
      return {
        userId, streakDays: data.streakDisabled ? 0 : (Number(data.streakDays) || 0),
        lastActiveDay: Number(data.lastActiveDay) || 0, isActiveToday: data.lastActiveDay === info.today,
        tier: getFlameTier(data.streakDisabled ? 0 : (data.streakDays || 0)), streakDisabled: Boolean(data.streakDisabled)
      };
    })
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

  const cfg = readConfig(), timestamp = Date.now();
  const threshold = Math.max(1, Number(daysThreshold) || 15);
  const affectedUsers = [];
  let modified = false;

  for (const [userId, u] of Object.entries(guildUsers)) {
    const { today } = prepareCalendar(u, userTimezone(profiles, userId, cfg), cfg, timestamp);
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
  setUserStreakTimezone,
  markStreakReminderSent,
  recoverStreakActivities,
  restoreHistoricalStreaks,
  recordMessageActivity,
  getUserStreakStatus,
  setGlobalStreakCustomization,
  setStreakAlertPreference,
  getStreakLeaderboard,
  checkAndDisableInactiveStreaks
};
