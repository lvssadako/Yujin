const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { readConfig } = require('../../utils/configCache');
const logger = require('../../utils/logger');

const FLAME_TIERS = [
  { minDays: 60, name: 'Fénix Legendario', emoji: '👑', color: 0xFF4500, xpMultiplier: 1.35, shopDiscount: 25, badge: '🔥 Fénix Eterno' },
  { minDays: 30, name: 'Fuego Cósmico', emoji: '🌟', color: 0x9B59B6, xpMultiplier: 1.25, shopDiscount: 20, badge: '🌟 Llama Cósmica' },
  { minDays: 14, name: 'Llama Diamante', emoji: '💎', color: 0x3498DB, xpMultiplier: 1.15, shopDiscount: 15, badge: '💎 Fuego Puro' },
  { minDays: 7,  name: 'Fuego Vivo', emoji: '🔥', color: 0xE67E22, xpMultiplier: 1.10, shopDiscount: 10, badge: '🔥 Racha 7D' },
  { minDays: 3,  name: 'Llama Eléctrica', emoji: '⚡', color: 0xF1C40F, xpMultiplier: 1.05, shopDiscount: 0, badge: null },
  { minDays: 1,  name: 'Chispa Inicial', emoji: '🕯️', color: 0x95A5A6, xpMultiplier: 1.00, shopDiscount: 0, badge: null }
];

function getFlameTier(streakDays) {
  const days = Math.max(0, Number(streakDays) || 0);
  for (const tier of FLAME_TIERS) {
    if (days >= tier.minDays) return tier;
  }
  return { minDays: 0, name: 'Sin Racha', emoji: '💤', color: 0x2F3136, xpMultiplier: 1.00, shopDiscount: 0, badge: null };
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

  const previousStreak = u.streakDays || 0;
  const isConsecutive = u.lastActiveDay === (today - 1);
  const newStreak = isConsecutive ? (previousStreak + 1) : 1;
  const wasReset = !isConsecutive && previousStreak > 0;

  u.streakDays = newStreak;
  u.lastActiveDay = today;
  writeProfiles(profiles);

  const prevTier = getFlameTier(previousStreak);
  const newTier = getFlameTier(newStreak);
  const tierUpgraded = isConsecutive && (newTier.minDays > prevTier.minDays);

  return {
    updated: true,
    streakDays: newStreak,
    previousStreak,
    isConsecutive,
    wasReset,
    tierUpgraded,
    tier: newTier
  };
}

function getUserStreakStatus(guildId, userId) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  const { today, midnightTs, msRemaining } = getLocalDayInfo();

  const streakDays = u.streakDays || 0;
  const lastActive = u.lastActiveDay || 0;
  const isActiveToday = (lastActive === today);
  const currentTier = getFlameTier(streakDays);
  const nextTier = getNextTier(streakDays);

  let progressPercent = 100;
  let daysToNext = 0;
  if (nextTier) {
    const range = nextTier.minDays - currentTier.minDays;
    const currentProgress = streakDays - currentTier.minDays;
    progressPercent = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));
    daysToNext = nextTier.minDays - streakDays;
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
    msRemaining
  };
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
  getStreakLeaderboard
};
