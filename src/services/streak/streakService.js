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

  if (u.lastActiveDay === today) {
    return { updated: false, streakDays: u.streakDays || 0, isNewDay: false };
  }

  const previousStreak = Number(u.streakDays) || 0;
  const isConsecutive = u.lastActiveDay === (today - 1);
  let savedByFreeze = false;
  let newStreak = 1;

  if (isConsecutive) {
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
    wasReset: !isConsecutive && !savedByFreeze && previousStreak > 0,
    tierUpgraded,
    coinsRewarded,
    tier: newTier
  };
}

function getUserStreakStatus(guildId, userId) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  const g = ensureGlobalUser(profiles, userId);
  const { today, midnightTs, msRemaining } = getLocalDayInfo();

  const streakDays = Number(u.streakDays) || 0;
  const lastActive = Number(u.lastActiveDay) || 0;
  const isActiveToday = (lastActive === today);
  const currentTier = getFlameTier(streakDays);
  const nextTier = getNextTier(streakDays);

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

  // Resolver fondo global dinámicamente
  let effectiveBgUrl = '';
  const tplKey = g.streakTemplate || 'inferno';
  if (tplKey === 'none') {
    effectiveBgUrl = '';
  } else if (STREAK_TEMPLATES[tplKey]) {
    effectiveBgUrl = STREAK_TEMPLATES[tplKey].url;
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
    // Personalización global
    streakBgUrl: effectiveBgUrl,
    streakBgOpacity: typeof g.streakBgOpacity === 'number' ? g.streakBgOpacity : 0.65,
    streakAccent: g.streakAccent || '',
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

function getStreakLeaderboard(guildId, limit = 10) {
  const profiles = readProfiles();
  const guildUsers = profiles.users?.[guildId] || {};
  const { today } = getLocalDayInfo();

  const activeUsers = Object.entries(guildUsers)
    .map(([userId, data]) => ({
      userId,
      streakDays: Number(data.streakDays) || 0,
      lastActiveDay: Number(data.lastActiveDay) || 0,
      isActiveToday: (data.lastActiveDay === today),
      tier: getFlameTier(data.streakDays || 0)
    }))
    .filter(u => u.streakDays > 0)
    .sort((a, b) => b.streakDays - a.streakDays);

  return {
    top: activeUsers.slice(0, limit),
    totalActive: activeUsers.length,
    highestStreak: activeUsers[0]?.streakDays || 0
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
  getStreakLeaderboard
};
