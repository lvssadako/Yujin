const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityType } = require('discord.js');
const { buildStatusMatcher, extractInviteCode, hasServerTag, normalizeStatusText } = require('../statusMatcher');
const { createPresenceRoleSync } = require('../presenceRoleSync');
const { setStatusTrigger, setTagTrigger, removeTriggersForRole, MAX_TRIGGERS } = require('../triggerAdmin');
const { resolveMemberTriggers } = require('../../../events/presenceStatusRoles');

test('matcher: reconoce variantes del enlace discord.gg/lco', () => {
  const m = buildStatusMatcher('.gg/lco');
  for (const ok of ['discord.gg/lco', 'https://discord.gg/lco', 'HTTP://WWW.DISCORD.GG/LCO', 'gg/lco', 'dsc.gg/lco',
    'discord.com/invite/lco', 'https://discordapp.com/invite/lco', 'únete → discord.gg/lco ♥', 'discord . gg / lco',
    'discord．gg／lco', 'dis​cord.gg/lco', 'discord.gg/lco!']) assert.equal(m(ok), true, ok);
});

test('matcher: no confunde otros códigos ni otros textos', () => {
  const m = buildStatusMatcher('discord.gg/lco');
  for (const bad of ['discord.gg/lcobot', 'discord.gg/lco_fake', 'discord.gg/xlco', 'lco', 'discord.gg/', '', null, 'gg lco', 'discord.com/invite/lcox']) {
    assert.equal(m(bad), false, String(bad));
  }
});

test('matcher: texto genérico se busca como subcadena normalizada', () => {
  assert.equal(buildStatusMatcher('LCO Server')(' mi  lco   server '), true);
  assert.equal(buildStatusMatcher('')('lo que sea'), false);
});

test('extractInviteCode y normalización', () => {
  assert.equal(extractInviteCode('https://discord.gg/lco'), 'lco');
  assert.equal(extractInviteCode('.gg/Mi-Codigo'), 'mi-codigo');
  assert.equal(extractInviteCode('texto libre'), null);
  assert.equal(normalizeStatusText('  A​B   C '), 'ab c');
});

test('tag: solo cuenta el tag de este servidor y activado', () => {
  const user = (over) => ({ primaryGuild: { identityGuildId: '111', identityEnabled: true, tag: 'LCO', ...over } });
  assert.equal(hasServerTag(user({}), '111'), true);
  assert.equal(hasServerTag(user({}), '222'), false);
  assert.equal(hasServerTag(user({ identityEnabled: false }), '111'), false);
  assert.equal(hasServerTag({ primaryGuild: null }, '111'), false);
  assert.equal(hasServerTag(null, '111'), false);
});

test('resolveMemberTriggers acepta triggers de tag sin texto y descarta basura', () => {
  const out = resolveMemberTriggers({ statusRoleTriggers: [
    { field: 'tag', roleId: '123' }, { field: 'status', includes: '', roleId: '1' }, { field: 'status', includes: 'x', roleId: '' },
    { field: 'otro', includes: 'x', roleId: '5' }, { field: 'status', includes: '.gg/lco', roleId: '456' }, null
  ] });
  assert.deepEqual(out.map(t => t.roleId), ['123', '456']);
});

// ---- sincronización ----
const ROLE = '900000000000000001';
function member({ roles = [], tag = null, bot = false } = {}) {
  const calls = [];
  const m = {
    id: 'u' + Math.random(), user: { bot, primaryGuild: tag }, guild: { id: 'g1' }, calls,
    roles: { cache: new Map(roles.map(r => [r, { id: r }])),
      async add(id) { calls.push(['add', id]); this.cache.set(id, { id }); },
      async remove(id) { calls.push(['remove', id]); this.cache.delete(id); } }
  };
  return m;
}
const sync = triggers => createPresenceRoleSync({ readConfig: () => ({}), resolveTriggers: () => triggers, validateRole: () => ({ valid: true }) });
const presence = (status, state) => ({ status, activities: state === undefined ? [] : [{ type: ActivityType.Custom, state }] });

test('estado: otorga con el enlace, retira al quitarlo, nunca toca a invisibles/offline', async () => {
  const s = sync([{ field: 'status', includes: '.gg/lco', roleId: ROLE }]);
  const m = member();
  assert.equal(await s.syncMemberStatus(m, presence('online', 'ven a discord.gg/lco')), 1);
  assert.deepEqual(m.calls, [['add', ROLE]]);
  assert.equal(await s.syncMemberStatus(m, presence('offline')), 0);
  assert.equal(await s.syncMemberStatus(m, presence('invisible', '')), 0);
  assert.equal(m.roles.cache.has(ROLE), true);
  assert.equal(await s.syncMemberStatus(m, presence('idle', 'sin enlace')), 1);
  assert.equal(m.roles.cache.has(ROLE), false);
});

test('tag: otorga al mostrar el tag y lo retira al quitarlo', async () => {
  const s = sync([{ field: 'tag', roleId: ROLE }]);
  const m = member({ tag: { identityGuildId: 'g1', identityEnabled: true } });
  assert.equal(await s.syncMemberTag(m), 1);
  m.user.primaryGuild = null;
  assert.equal(await s.syncMemberTag(m), 1);
  assert.equal(m.roles.cache.has(ROLE), false);
  assert.equal(await s.syncMemberTag(m), 0);
});

test('los bots y roles no gestionables se ignoran', async () => {
  const s = sync([{ field: 'tag', roleId: ROLE }]);
  assert.equal(await s.syncMemberTag(member({ bot: true, tag: { identityGuildId: 'g1', identityEnabled: true } })), 0);
  const blocked = createPresenceRoleSync({ readConfig: () => ({}), resolveTriggers: () => [{ field: 'tag', roleId: ROLE }], validateRole: () => ({ valid: false }) });
  const m = member({ tag: { identityGuildId: 'g1', identityEnabled: true } });
  assert.equal(await blocked.syncMemberTag(m), 0);
  assert.equal(m.calls.length, 0);
});

test('reconciliación: usa presencias visibles y ex-miembros del tag; sin reglas no consulta nada', async () => {
  const s = sync([{ field: 'status', includes: '.gg/lco', roleId: ROLE }, { field: 'tag', roleId: ROLE }]);
  const withLink = member(); const offlineHolder = member({ roles: [ROLE] });
  withLink.id = 'a'; offlineHolder.id = 'b';
  const guild = { id: 'g1', presences: { cache: new Map([['a', { userId: 'a', ...presence('online', 'discord.gg/lco') }], ['b', { userId: 'b', ...presence('offline') }]]) },
    members: { cache: new Map([['a', withLink], ['b', offlineHolder]]), fetch: async () => new Map() } };
  const result = await s.reconcileGuild(guild);
  assert.deepEqual(result, { status: 1, tag: 0 });
  assert.equal(offlineHolder.roles.cache.has(ROLE), true);
  const none = sync([]);
  assert.deepEqual(await none.reconcileGuild({ presences: { cache: new Map() }, members: { fetch: () => { throw new Error('no'); } } }), { status: 0, tag: 0 });
});

test('administración de reglas: reemplaza, limita y quita', () => {
  let r = setStatusTrigger([], '100000', 'discord.gg/lco');
  assert.equal(r.triggers.length, 1);
  r = setStatusTrigger(r.triggers, '100000', 'discord.gg/otro');
  assert.deepEqual(r.triggers.map(t => t.includes), ['discord.gg/otro']);
  r = setTagTrigger(r.triggers, '200000'); r = setTagTrigger(r.triggers, '300000');
  assert.deepEqual(r.triggers.filter(t => t.field === 'tag').map(t => t.roleId), ['300000']);
  assert.equal(setStatusTrigger([], 'abc').ok, false);
  assert.equal(setStatusTrigger([], '100000', 'x').ok, false);
  const full = Array.from({ length: MAX_TRIGGERS }, (_, i) => ({ field: 'status', includes: 'abc', roleId: String(100000 + i) }));
  assert.equal(setStatusTrigger(full, '999999', 'abc').ok, false);
  assert.equal(removeTriggersForRole(r.triggers, '300000').removed, 1);
});
