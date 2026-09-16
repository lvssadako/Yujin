const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');

const topRolesCommand = require('../toproles');

test('toproles exposes slash and prefix handlers', () => {
  assert.equal(typeof topRolesCommand.execute, 'function');
  assert.equal(typeof topRolesCommand.executePrefix, 'function');
});

test('toproles rejects direct messages and unauthorized slash execution', async () => {
  let reply;
  await topRolesCommand.execute({
    guild: null,
    member: { permissions: { has: () => false } },
    reply: async payload => { reply = payload; }
  });
  assert.match(reply.content, /solo puede usarse en un servidor/i);

  await topRolesCommand.execute({
    guild: { id: '123' },
    member: { permissions: { has: () => false } },
    reply: async payload => { reply = payload; }
  });
  assert.match(reply.content, /permisos/i);
});

test('toproles keeps prefix permission and role hierarchy checks', async () => {
  let reply;
  const message = {
    guild: { id: '123' },
    member: { permissions: { has: () => true } },
    mentions: { roles: { first: () => ({ id: '456', editable: false }) } },
    reply: async payload => { reply = payload; }
  };

  await topRolesCommand.executePrefix(message, ['set', '1']);
  assert.match(reply, /No puedo gestionar ese rol/i);
  assert.equal(message.member.permissions.has(PermissionFlagsBits.ManageRoles), true);
});
