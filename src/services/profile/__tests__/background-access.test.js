const test = require('node:test');
const assert = require('node:assert/strict');
const { getBackgroundAccess, resolveStreakDays, REQUIRED_STREAK_DAYS } = require('../backgroundAccess');
const { createProfileBackgroundService } = require('../profileBackgroundService');
const { WALLPAPER_PRESETS } = require('../../../constants/profileThemes');

const plain = { premiumSince: null, guild: { id: '111111', roles: {} }, roles: { cache: new Map() }, id: '222222' };
const booster = { ...plain, premiumSince: new Date() };

test('acceso: booster gratis, racha 359 no y 360 sí, nivel/racha 7 ya no desbloquean, pase sí', () => {
  assert.deepEqual(getBackgroundAccess({ member: booster }), { allowed: true, reason: 'booster' });
  assert.equal(getBackgroundAccess({ member: plain, streakDays: 359 }).allowed, false);
  assert.equal(getBackgroundAccess({ member: plain, streakDays: REQUIRED_STREAK_DAYS }).reason, 'streak');
  assert.equal(getBackgroundAccess({ member: plain, streakDays: 7 }).allowed, false);
  assert.equal(getBackgroundAccess({ member: plain, hasPass: true }).reason, 'pass');
  assert.equal(getBackgroundAccess({ member: plain, hasPass: 'yes' }).allowed, false);
});

test('acceso: rol de booster cuenta como booster', () => {
  const role = { id: 'r1' };
  const member = { ...plain, guild: { id: '111111', roles: { premiumSubscriberRole: role } }, roles: { cache: new Map([['r1', role]]) } };
  assert.equal(getBackgroundAccess({ member }).reason, 'booster');
});

test('racha desactivada o inválida cuenta como 0', () => {
  assert.equal(resolveStreakDays({ streakDays: 400, streakDisabled: true }), 0);
  assert.equal(resolveStreakDays({ streakDays: 'abc' }), 0);
  assert.equal(resolveStreakDays({ streakDays: 361.9 }), 361);
});

function harness({ pass = false } = {}) {
  const profiles = { users: {} };
  const calls = { save: [], del: 0, writes: 0 };
  const service = createProfileBackgroundService({
    readProfiles: () => profiles,
    writeProfiles: () => { calls.writes += 1; },
    ensureUser: (p, g, u) => ((p.users[g] ||= {})[u] ||= { bgUrl: '', streakDays: 0 }),
    hasPass: () => pass,
    imageService: {
      saveUserProfileBackground: async (g, u, url) => { calls.save.push(url); return { ok: true, size: 2048 }; },
      deleteUserProfileBackground: async () => { calls.del += 1; }
    }
  });
  return { service, profiles, calls };
}

test('servicio: sin acceso no guarda ni descarga la imagen', async () => {
  const { service, calls } = harness();
  const r = await service.setCustomUrl(plain, 'https://example.com/a.png');
  assert.equal(r.code, 'locked');
  assert.equal(calls.save.length, 0);
  assert.equal(calls.writes, 0);
});

test('servicio: URL insegura se rechaza antes de mirar el acceso', async () => {
  const { service, calls } = harness({ pass: true });
  for (const bad of ['http://127.0.0.1/a.png', 'javascript:alert(1)', '', null, 'https://localhost/x.png']) {
    assert.equal((await service.setCustomUrl(plain, bad)).code, 'invalid_url', String(bad));
  }
  assert.equal(calls.save.length, 0);
});

test('servicio: booster y pase guardan; el preset es gratis para todos', async () => {
  const b = harness();
  assert.equal((await b.service.setCustomUrl(booster, 'https://example.com/a.png')).ok, true);
  const p = harness({ pass: true });
  assert.equal((await p.service.setCustomUrl(plain, 'https://example.com/a.png')).reason, 'pass');
  const free = harness();
  const id = Object.keys(WALLPAPER_PRESETS)[0];
  assert.equal((await free.service.setPreset('111111', '222222', id)).ok, true);
  assert.equal((await free.service.setPreset('111111', '222222', '__proto__')).ok, false);
});

test('enforceAccess retira el fondo propio si ya no hay acceso y respeta presets', async () => {
  const h = harness();
  const guild = { id: '111111', members: { fetch: async () => plain } };
  const user = (h.profiles.users['111111'] ||= {})['222222'] = { bgUrl: 'https://example.com/mine.png', streakDays: 10 };
  assert.deepEqual(await h.service.enforceAccess(guild, '222222'), { changed: true });
  assert.equal(user.bgUrl, '');
  user.bgUrl = Object.values(WALLPAPER_PRESETS)[0].url;
  assert.deepEqual(await h.service.enforceAccess(guild, '222222'), { changed: false });
});
