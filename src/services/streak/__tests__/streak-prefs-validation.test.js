const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readProfiles,
  writeProfiles,
  applyStreakPrefsValidation,
  migrateStreakPreferences
} = require('../../../utils/profileStore');
const { canSendDmNotification } = require('../../notification/dmNotificationService');
const { setStreakAlertPreference, areStreakAlertsDisabled } = require('../streakService');
const { STREAK_PREFS_VERSION } = require('../../../constants/streakRules');

function legacy(streakDays, extra = {}) {
  return {
    streakDays,
    streakAlertsDisabled: false, // los había activado antes del cambio
    dmNotifications: { all: true, streaks: true, warns: true, levels: true, boosts: true, badges: true },
    ...extra
  };
}

test('conserva la configuración si ya tenía 5 días o más antes del cambio', () => {
  const u = legacy(5);
  assert.equal(applyStreakPrefsValidation(u), true);
  assert.equal(u.streakAlertsDisabled, false);
  assert.equal(areStreakAlertsDisabled(u), false);
  assert.equal(u.streakPrefsVersion, STREAK_PREFS_VERSION);
});

test('restablece al valor por defecto si tenía menos de 5 días', () => {
  const u = legacy(4);
  applyStreakPrefsValidation(u);
  assert.equal('streakAlertsDisabled' in u, false);
  assert.equal(u.dmNotifications.streaks, false);
  assert.equal(areStreakAlertsDisabled(u), true);
  // Las demás categorías no se tocan
  assert.equal(u.dmNotifications.warns, true);
});

test('una racha deshabilitada por inactividad no cuenta como activa', () => {
  const u = legacy(0, { streakDisabled: true, streakPausedAt: 20 });
  applyStreakPrefsValidation(u);
  assert.equal(areStreakAlertsDisabled(u), true);
});

test('la validación se aplica una sola vez y respeta cambios posteriores', () => {
  const u = legacy(2);
  applyStreakPrefsValidation(u);
  u.streakAlertsDisabled = false; // el usuario los vuelve a activar después
  assert.equal(applyStreakPrefsValidation(u), false);
  assert.equal(u.streakAlertsDisabled, false);
});

test('migrateStreakPreferences valida todos los perfiles guardados', () => {
  const guildId = 'guild_test_prefs_migration';
  const profiles = readProfiles();
  profiles.users[guildId] = {
    veterano: legacy(12),
    novato: legacy(3)
  };
  writeProfiles(profiles);

  const result = migrateStreakPreferences();
  assert.ok(result.migrated >= 2);

  assert.equal(canSendDmNotification(guildId, 'veterano', 'streaks'), true);
  assert.equal(canSendDmNotification(guildId, 'novato', 'streaks'), false);

  // Volver a ejecutarla no cambia nada para estos usuarios
  migrateStreakPreferences();
  assert.equal(canSendDmNotification(guildId, 'veterano', 'streaks'), true);

  // Un usuario con menos de 5 días puede volver a activarlos manualmente
  setStreakAlertPreference(guildId, 'novato', false);
  assert.equal(canSendDmNotification(guildId, 'novato', 'streaks'), true);
});

test('la validación también se aplica al leer un perfil antiguo sin migrar', () => {
  const guildId = 'guild_test_prefs_lazy';
  const profiles = readProfiles();
  profiles.users[guildId] = { antiguo: legacy(1), antiguo_activo: legacy(6) };
  writeProfiles(profiles);

  assert.equal(canSendDmNotification(guildId, 'antiguo', 'streaks'), false);
  assert.equal(canSendDmNotification(guildId, 'antiguo_activo', 'streaks'), true);
});
