const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STREAK_ACTIVATION_DAYS,
  isStreakActive,
  getFlameTier,
  getNextTier,
  getUserStreakStatus,
  getStreakLeaderboard,
  recordMessageActivity,
  setStreakAlertPreference,
  getLocalDayInfo
} = require('../streakService');
const { canSendDmNotification, getNotificationPreferences } = require('../../notification/dmNotificationService');
const { readProfiles, writeProfiles } = require('../../../utils/profileStore');

test('la racha se activa a partir de 5 días', () => {
  assert.equal(STREAK_ACTIVATION_DAYS, 5);
  for (const d of [0, 1, 2, 3, 4]) assert.equal(isStreakActive(d), false, `día ${d}`);
  for (const d of [5, 6, 30]) assert.equal(isStreakActive(d), true, `día ${d}`);
});

test('antes de 5 días no hay nivel de fuego ni beneficios', () => {
  for (const d of [1, 2, 3, 4]) {
    const tier = getFlameTier(d);
    assert.equal(tier.minDays, 0);
    assert.equal(tier.xpMultiplier, 1);
    assert.equal(tier.rewardCoins, 0);
    assert.equal(tier.name, 'Racha en Formación');
  }
  assert.equal(getFlameTier(0).name, 'Sin Racha');
  assert.equal(getFlameTier(5).minDays, 5);
  assert.equal(getNextTier(3).minDays, 5);
});

test('la recompensa de activación se entrega al llegar al día 5, no antes', () => {
  const guildId = 'guild_test_activation_reward';
  const { today } = getLocalDayInfo();
  const profiles = readProfiles();
  profiles.users[guildId] = {
    user_day3: { streakDays: 3, lastActiveDay: today - 1 },
    user_day4: { streakDays: 4, lastActiveDay: today - 1 }
  };
  writeProfiles(profiles);

  const r4 = recordMessageActivity(guildId, 'user_day3');
  assert.equal(r4.streakDays, 4);
  assert.equal(r4.isActive, false);
  assert.equal(r4.tierUpgraded, false);
  assert.equal(r4.coinsRewarded, 0);

  const r5 = recordMessageActivity(guildId, 'user_day4');
  assert.equal(r5.streakDays, 5);
  assert.equal(r5.isActive, true);
  assert.equal(r5.tierUpgraded, true);
  assert.equal(r5.coinsRewarded, 500);
});

test('el top de rachas solo incluye rachas activas (>= 5 días)', () => {
  const guildId = 'guild_test_activation_lb';
  const { today } = getLocalDayInfo();
  const profiles = readProfiles();
  profiles.users[guildId] = {
    user_forming: { streakDays: 4, lastActiveDay: today },
    user_active: { streakDays: 5, lastActiveDay: today }
  };
  writeProfiles(profiles);

  const ids = getStreakLeaderboard(guildId).top.map(u => u.userId);
  assert.deepEqual(ids, ['user_active']);
});

test('el estado expone si la racha está activa y cuánto falta', () => {
  const guildId = 'guild_test_activation_status';
  const { today } = getLocalDayInfo();
  const profiles = readProfiles();
  profiles.users[guildId] = { user_a: { streakDays: 2, lastActiveDay: today } };
  writeProfiles(profiles);

  const status = getUserStreakStatus(guildId, 'user_a');
  assert.equal(status.isActive, false);
  assert.equal(status.daysToActivation, 3);
});

test('los DMs de racha están apagados por defecto y se pueden activar', () => {
  const guildId = 'guild_test_dm_default';
  const userId = 'user_dm_default';

  assert.equal(getUserStreakStatus(guildId, userId).alertsDisabled, true);
  assert.equal(getNotificationPreferences(guildId, userId).streaks, false);
  assert.equal(canSendDmNotification(guildId, userId, 'streaks'), false);
  // Las demás categorías siguen activas por defecto
  assert.equal(canSendDmNotification(guildId, userId, 'warns'), true);

  setStreakAlertPreference(guildId, userId, false);
  assert.equal(getUserStreakStatus(guildId, userId).alertsDisabled, false);
  assert.equal(canSendDmNotification(guildId, userId, 'streaks'), true);

  setStreakAlertPreference(guildId, userId, true);
  assert.equal(canSendDmNotification(guildId, userId, 'streaks'), false);
});

test('perfiles antiguos sin preferencia explícita quedan con DMs de racha apagados', () => {
  const guildId = 'guild_test_dm_legacy';
  const profiles = readProfiles();
  profiles.users[guildId] = {
    // Perfil creado antes del cambio: dmNotifications inicializado con streaks: true
    legacy_user: { streakDays: 10, dmNotifications: { all: true, streaks: true, warns: true, levels: true, boosts: true, badges: true } },
    // Usuario que activó explícitamente los avisos
    opted_in: { streakDays: 10, streakAlertsDisabled: false, dmNotifications: { all: true, streaks: true } }
  };
  writeProfiles(profiles);

  assert.equal(canSendDmNotification(guildId, 'legacy_user', 'streaks'), false);
  assert.equal(canSendDmNotification(guildId, 'opted_in', 'streaks'), true);
});
