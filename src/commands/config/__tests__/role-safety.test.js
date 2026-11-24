const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const shopadmin = require('../shopadmin');
const statusrole = require('../statusrole');

const permsOf = (...flags) => ({ has: f => flags.includes(f) });
const staff = { permissions: permsOf(PermissionFlagsBits.ManageRoles) };
const dangerousRole = { id: '900000000000000001', name: 'Admin', managed: false, permissions: permsOf(PermissionFlagsBits.Administrator), toString: () => '@Admin' };

function prefixMessage(role) {
  const replies = [];
  return {
    replies,
    guild: { id: '1', roles: { cache: new Map([[role.id, role]]) } },
    member: staff,
    mentions: { roles: { first: () => role } },
    reply: async payload => replies.push(payload)
  };
}

test('/shopadmin rechaza vender un rol con permisos de administración (antes de tocar la configuración)', async () => {
  const m = prefixMessage(dangerousRole);
  await shopadmin.executePrefix(m, ['rol-agregar', '<@&900000000000000001>', '1000', '7', 'Rol', 'Peligroso']);
  assert.match(m.replies[0].content, /permisos de administración o moderación/);
});

test('/statusrole rechaza otorgar un rol con permisos de administración por estado o tag', async () => {
  for (const sub of ['estado', 'tag']) {
    const m = prefixMessage(dangerousRole);
    await statusrole.executePrefix(m, [sub, '<@&900000000000000001>']);
    assert.match(m.replies[0].content, /permisos de administración o moderación/, sub);
  }
});

test('sin permisos de staff ningún comando de configuración actúa', async () => {
  const m = prefixMessage(dangerousRole);
  m.member = { permissions: permsOf() };
  await shopadmin.executePrefix(m, ['rol-agregar', '<@&900000000000000001>', '1000', '7', 'X']);
  await statusrole.executePrefix(m, ['estado', '<@&900000000000000001>']);
  for (const r of m.replies) assert.match(r.content, /Necesitas permiso/);
});
