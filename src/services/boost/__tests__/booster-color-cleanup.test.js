const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { createBoosterColorCleanup } = require('../boosterColorCleanup');

const COLOR_A = '900000000000000001'; const COLOR_B = '900000000000000002'; const OTHER = '900000000000000003';

function makeGuild({ canManage = true, botPos = 50 } = {}) {
  return {
    id: 'g1',
    members: { me: { permissions: { has: p => canManage && p === PermissionFlagsBits.ManageRoles }, roles: { highest: { position: botPos } } } },
    roles: { cache: new Map([[COLOR_A, { position: 10 }], [COLOR_B, { position: 11 }]]) }
  };
}
function makeMember(guild, roleIds, { booster = false, failRemove = false } = {}) {
  const removed = [];
  return {
    id: 'u' + Math.random(), guild, premiumSince: booster ? new Date() : null, partial: false, removed,
    roles: { cache: new Map(roleIds.map(id => [id, { id }])), async remove(ids) { if (failRemove) throw new Error('x'); removed.push(...ids); } }
  };
}
const build = () => createBoosterColorCleanup({
  getConfig: () => ({ colors: [{ roleId: COLOR_A }, { roleId: COLOR_B }] }),
  isMemberBooster: m => Boolean(m?.premiumSince)
});

test('al perder el boost se retiran solo los roles de color, no los demás', async () => {
  const guild = makeGuild(); const cleanup = build();
  const oldM = makeMember(guild, [COLOR_A, OTHER], { booster: true });
  const newM = makeMember(guild, [COLOR_A, OTHER]);
  assert.deepEqual(await cleanup.handleMemberUpdate(oldM, newM), [COLOR_A]);
  assert.deepEqual(newM.removed, [COLOR_A]);
});

test('un booster activo conserva su color y quien nunca fue booster no genera trabajo', async () => {
  const guild = makeGuild(); const cleanup = build();
  const stays = makeMember(guild, [COLOR_A], { booster: true });
  assert.deepEqual(await cleanup.handleMemberUpdate(stays, stays), []);
  const nonBoosterBefore = makeMember(guild, [COLOR_A]);
  assert.deepEqual(await cleanup.handleMemberUpdate(nonBoosterBefore, makeMember(guild, [COLOR_A])), []);
  assert.equal(stays.removed.length, 0);
});

test('estado previo parcial: igual limpia si ya no es booster', async () => {
  const guild = makeGuild(); const cleanup = build();
  const newM = makeMember(guild, [COLOR_B]);
  assert.deepEqual(await cleanup.handleMemberUpdate({ partial: true }, newM), [COLOR_B]);
});

test('sin permisos o jerarquía insuficiente no intenta quitar nada', async () => {
  const cleanup = build();
  for (const guild of [makeGuild({ canManage: false }), makeGuild({ botPos: 5 })]) {
    const m = makeMember(guild, [COLOR_A]);
    assert.deepEqual(await cleanup.revokeIfNotBooster(m), []);
    assert.equal(m.removed.length, 0);
  }
});

test('un fallo de Discord no lanza excepción', async () => {
  const guild = makeGuild(); const cleanup = build();
  assert.deepEqual(await cleanup.revokeIfNotBooster(makeMember(guild, [COLOR_A], { failRemove: true })), []);
});

test('barrido: limpia ex-boosters existentes y respeta a los boosters', async () => {
  const guild = makeGuild();
  const ex = makeMember(guild, [COLOR_A]); const live = makeMember(guild, [COLOR_B], { booster: true }); const plain = makeMember(guild, [OTHER]);
  guild.members.fetch = async () => new Map([['1', ex], ['2', live], ['3', plain]]);
  const result = await build().sweepGuild(guild);
  assert.deepEqual(result, { checked: 2, cleaned: 1 });
  assert.deepEqual(ex.removed, [COLOR_A]);
  assert.equal(live.removed.length, 0);
});

test('barrido sin colores configurados no consulta miembros', async () => {
  const cleanup = createBoosterColorCleanup({ getConfig: () => ({ colors: [] }), isMemberBooster: () => false });
  const guild = { id: 'g', members: { fetch: () => { throw new Error('no debería llamarse'); } } };
  assert.deepEqual(await cleanup.sweepGuild(guild), { checked: 0, cleaned: 0 });
});
