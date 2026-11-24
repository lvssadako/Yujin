const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoosterProfileService } = require('../boosterProfileService');
const { WALLPAPER_PRESETS } = require('../../../constants/profileThemes');

const member = { id: '222222222', guild: { id: '111111111' } };
const PRESET = Object.values(WALLPAPER_PRESETS)[0].url;

function harness({ user = {}, allowed = false } = {}) {
  const profiles = { users: { [member.guild.id]: { [member.id]: { title: 'Mi título', accent: '#00ffcc', bgUrl: '', bgOpacity: 0.7, equippedBadges: ['a'], ...user } } } };
  const calls = { writes: 0, deleted: 0 };
  const svc = createBoosterProfileService({
    readProfiles: () => profiles,
    writeProfiles: () => { calls.writes += 1; },
    ensureUser: (p, g, u) => p.users[g][u],
    accessFor: () => ({ allowed }),
    imageService: { deleteUserProfileBackground: async () => { calls.deleted += 1; } },
    now: () => 1700000000000
  });
  return { svc, calls, user: profiles.users[member.guild.id][member.id] };
}

test('al perder el boost se guarda y retira solo el fondo propio; título, colores e insignias no se tocan', async () => {
  const h = harness({ user: { bgUrl: 'https://example.com/mio.png', bgOpacity: 0.5 } });
  assert.deepEqual(await h.svc.onBoostLost(member), { cleared: true });
  assert.equal(h.user.bgUrl, '');
  assert.deepEqual(h.user.boosterBackup, { bgUrl: 'https://example.com/mio.png', bgOpacity: 0.5, savedAt: 1700000000000 });
  assert.equal(h.user.title, 'Mi título');
  assert.equal(h.user.accent, '#00ffcc');
  assert.deepEqual(h.user.equippedBadges, ['a']);
  assert.equal(h.calls.deleted, 1);
});

test('si conserva acceso por pase o racha, el fondo se queda y no hay respaldo', async () => {
  const h = harness({ user: { bgUrl: 'https://example.com/mio.png' }, allowed: true });
  assert.deepEqual(await h.svc.onBoostLost(member), { cleared: false });
  assert.equal(h.user.bgUrl, 'https://example.com/mio.png');
  assert.equal(h.user.boosterBackup, undefined);
  assert.equal(h.calls.deleted, 0);
});

test('un wallpaper de la galería (gratis) nunca se retira', async () => {
  const h = harness({ user: { bgUrl: PRESET } });
  assert.deepEqual(await h.svc.onBoostLost(member), { cleared: false });
  assert.equal(h.user.bgUrl, PRESET);
});

test('idempotente: perder el boost dos veces no pisa el respaldo ni repite avisos', async () => {
  const h = harness({ user: { bgUrl: 'https://example.com/mio.png' } });
  await h.svc.onBoostLost(member);
  const writes = h.calls.writes;
  assert.deepEqual(await h.svc.onBoostLost(member), { cleared: false });
  assert.equal(h.calls.writes, writes);
  assert.equal(h.user.boosterBackup.bgUrl, 'https://example.com/mio.png');
});

test('al volver a boostear se restaura el fondo, una sola vez', async () => {
  const h = harness({ user: { bgUrl: 'https://example.com/mio.png', bgOpacity: 0.4 } });
  await h.svc.onBoostLost(member);
  assert.deepEqual(h.svc.onBoostGained(member), { restored: true });
  assert.equal(h.user.bgUrl, 'https://example.com/mio.png');
  assert.equal(h.user.bgOpacity, 0.4);
  assert.equal(h.user.boosterBackup, null);
  assert.equal(h.user.boosterProfileState, 'active');
  assert.deepEqual(h.svc.onBoostGained(member), { restored: false });
});

test('no pisa un fondo que eligió mientras no era booster', async () => {
  const h = harness({ user: { bgUrl: 'https://example.com/mio.png' } });
  await h.svc.onBoostLost(member);
  h.user.bgUrl = PRESET;
  assert.deepEqual(h.svc.onBoostGained(member), { restored: false });
  assert.equal(h.user.bgUrl, PRESET);
  assert.equal(h.user.boosterBackup, null);
});

test('un booster nuevo (sin historial) no genera escrituras', () => {
  const h = harness();
  assert.deepEqual(h.svc.onBoostGained(member), { restored: false });
  assert.equal(h.calls.writes, 0);
});
