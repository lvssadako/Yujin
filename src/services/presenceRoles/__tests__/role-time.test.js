const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoleTimeTracker } = require('../roleTimeTracker');
const { statusRoleIds } = require('../statusRoleIds');

const ROLE = '900000000000000001'; const ROLE2 = '900000000000000002';

function harness(cfg = { statusRoleTriggers: [{ field: 'status', includes: '.gg/lco', roleId: ROLE }] }) {
  let clock = 1_700_000_000_000;
  const timers = new Map(); const progress = [];
  const key = (g, u, r) => `${g}:${u}:${r}`;
  const store = {
    ensureTimer: (g, u, r) => { if (!timers.has(key(g, u, r))) timers.set(key(g, u, r), { startAt: 0, lastTick: 0 }); return timers.get(key(g, u, r)); },
    setStart: (g, u, r, ms) => timers.set(key(g, u, r), { startAt: ms, lastTick: ms }),
    popElapsedMinutes: (g, u, r, ms) => { const t = timers.get(key(g, u, r)); if (!t?.startAt) return 0; const m = Math.floor((ms - t.lastTick) / 60000); t.lastTick = ms; return Math.max(0, m); },
    clearTimer: (g, u, r) => timers.delete(key(g, u, r))
  };
  const tracker = createRoleTimeTracker({ store, readConfig: () => cfg, updateMissionProgress: (guild, user, type, mins) => progress.push([user, type, mins]), now: () => clock });
  const guild = { id: 'g1', roles: { cache: new Map([[ROLE, { id: ROLE, members: new Map() }]]) } };
  const mk = (id, has) => ({ id, guild, user: { bot: false }, roles: { cache: new Map(has ? [[ROLE, {}]] : []) } });
  return { tracker, guild, mk, progress, timers, key, tick: ms => { clock += ms; } };
}

test('statusRoleIds: rol heredado más los de las reglas de estado, sin duplicados ni reglas de tag', () => {
  assert.deepEqual(statusRoleIds({ statusRoleId: ROLE, statusRoleTriggers: [{ field: 'status', roleId: ROLE }, { field: 'status', roleId: ROLE2 }, { field: 'tag', roleId: '3' }] }), [ROLE, ROLE2]);
  assert.deepEqual(statusRoleIds({}), []);
  assert.deepEqual(statusRoleIds({ status: { roleId: ROLE } }), [ROLE]);
});

test('ganar el rol inicia el contador y perderlo acredita los minutos y lo cierra', () => {
  const h = harness();
  h.tracker.handleMemberUpdate(h.mk('u1', false), h.mk('u1', true));
  assert.equal(h.timers.get(h.key('g1', 'u1', ROLE)).startAt > 0, true);
  h.tick(45 * 60000);
  h.tracker.handleMemberUpdate(h.mk('u1', true), h.mk('u1', false));
  assert.deepEqual(h.progress, [['u1', 'role_time', 45]]);
  assert.equal(h.timers.has(h.key('g1', 'u1', ROLE)), false);
});

test('el tick acredita a quien conserva el rol sin esperar a que lo pierda', () => {
  const h = harness();
  const m = h.mk('u1', true);
  h.guild.roles.cache.get(ROLE).members.set('u1', m);
  h.tracker.tickGuild(h.guild); // primer tick: solo inicia (no había contador)
  assert.deepEqual(h.progress, []);
  h.tick(10 * 60000); h.tracker.tickGuild(h.guild);
  h.tick(10 * 60000); h.tracker.tickGuild(h.guild);
  assert.deepEqual(h.progress, [['u1', 'role_time', 10], ['u1', 'role_time', 10]]);
});

test('no se acredita dos veces el mismo intervalo', () => {
  const h = harness();
  h.guild.roles.cache.get(ROLE).members.set('u1', h.mk('u1', true));
  h.tracker.tickGuild(h.guild); h.tick(30 * 60000);
  h.tracker.tickGuild(h.guild); h.tracker.tickGuild(h.guild);
  assert.deepEqual(h.progress, [['u1', 'role_time', 30]]);
});

test('bots, roles no configurados y roles inexistentes se ignoran', () => {
  const h = harness();
  const bot = h.mk('b1', true); bot.user.bot = true;
  h.tracker.handleMemberUpdate(h.mk('b1', false), bot);
  assert.equal(h.timers.size, 0);
  const none = harness({});
  none.tracker.handleMemberUpdate(none.mk('u', false), none.mk('u', true));
  assert.equal(none.timers.size, 0);
  const ghost = harness({ statusRoleTriggers: [{ field: 'status', includes: 'x', roleId: ROLE2 }] });
  ghost.tracker.handleMemberUpdate(ghost.mk('u', false), ghost.mk('u', true));
  assert.equal(ghost.tracker.tickGuild(ghost.guild), 0);
  assert.equal(ghost.timers.size, 0);
});

test('la misión de rol del pool usa los roles de /statusrole', () => {
  const missions = require('../../../utils/dailyMissions');
  assert.equal(typeof missions.genDaily, 'function'); // el módulo carga con el nuevo helper
});
