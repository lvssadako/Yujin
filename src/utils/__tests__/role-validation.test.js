const test = require('node:test');
const assert = require('node:assert/strict');

const { canBotManageRole, validateRoleForAssignment } = require('../roleValidation');

test('canBotManageRole rejects managed roles', () => {
  const role = { id: 'role-1', name: 'Bot Role', managed: true, comparePositionTo: () => -1 };
  const botMember = { roles: { highest: { name: 'Bot' } } };
  const guild = { 
    client: { user: { id: 'bot-id' } },
    members: { cache: new Map([['bot-id', botMember]]) },
    roles: { everyone: { id: '@everyone' } }
  };

  assert.equal(canBotManageRole(guild, role), false);
});

test('canBotManageRole rejects @everyone role', () => {
  const everyoneRole = { id: '@everyone', name: '@everyone', managed: false, comparePositionTo: () => -1 };
  const botMember = { roles: { highest: { name: 'Bot' } } };
  const guild = {
    client: { user: { id: 'bot-id' } },
    members: { cache: new Map([['bot-id', botMember]]) },
    roles: { everyone: everyoneRole }
  };

  assert.equal(canBotManageRole(guild, everyoneRole), false);
});

test('canBotManageRole rejects role above bot hierarchy', () => {
  const role = { id: 'high-role', name: 'High Role', managed: false, comparePositionTo: () => 1 };
  const botMember = { roles: { highest: { name: 'Bot' } } };
  const guild = {
    client: { user: { id: 'bot-id' } },
    members: { cache: new Map([['bot-id', botMember]]) },
    roles: { everyone: { id: '@everyone' } }
  };

  assert.equal(canBotManageRole(guild, role), false);
});

test('canBotManageRole accepts valid role', () => {
  const role = { id: 'valid-role', name: 'Valid Role', managed: false, comparePositionTo: () => -1 };
  const botMember = { roles: { highest: { name: 'Bot' } } };
  const guild = {
    client: { user: { id: 'bot-id' } },
    members: { cache: new Map([['bot-id', botMember]]) },
    roles: { everyone: { id: '@everyone' } }
  };

  assert.equal(canBotManageRole(guild, role), true);
});

test('validateRoleForAssignment rejects missing role', () => {
  const guild = {
    client: { user: { id: 'bot-id' } },
    members: { cache: new Map() },
    roles: { cache: new Map(), everyone: { id: '@everyone' } }
  };

  const result = validateRoleForAssignment(guild, 'nonexistent-role');
  assert.equal(result.valid, false);
  assert.match(result.reason, /not found/i);
});

// ---- Roles con permisos peligrosos ----
const { PermissionFlagsBits } = require('discord.js');
const { hasDangerousPermissions } = require('../roleValidation');

const permsOf = (...flags) => ({ has: f => flags.includes(f) });

test('hasDangerousPermissions detecta permisos de administración y moderación', () => {
  for (const name of ['Administrator', 'ManageGuild', 'ManageRoles', 'BanMembers', 'KickMembers', 'ModerateMembers', 'MentionEveryone', 'ManageMessages']) {
    assert.equal(hasDangerousPermissions({ permissions: permsOf(PermissionFlagsBits[name]) }), true, name);
  }
  assert.equal(hasDangerousPermissions({ permissions: permsOf(PermissionFlagsBits.SendMessages, PermissionFlagsBits.ChangeNickname) }), false);
  assert.equal(hasDangerousPermissions({ permissions: permsOf() }), false);
  assert.equal(hasDangerousPermissions({}), false);
  assert.equal(hasDangerousPermissions(null), false);
});

test('validateRoleForAssignment rechaza roles peligrosos solo cuando se pide', () => {
  const role = { id: 'r1', name: 'Mod', managed: false, comparePositionTo: () => -1, permissions: permsOf(PermissionFlagsBits.BanMembers) };
  const guild = {
    client: { user: { id: 'bot-id' } },
    members: { cache: new Map([['bot-id', { roles: { highest: { name: 'Bot' } } }]]) },
    roles: { cache: new Map([['r1', role]]), everyone: { id: '@everyone' } }
  };
  assert.equal(validateRoleForAssignment(guild, 'r1', 'x').valid, true); // comportamiento anterior intacto
  const strict = validateRoleForAssignment(guild, 'r1', 'x', { rejectDangerous: true });
  assert.equal(strict.valid, false);
  assert.equal(strict.dangerous, true);
  const safe = { ...role, id: 'r2', permissions: permsOf(PermissionFlagsBits.SendMessages) };
  guild.roles.cache.set('r2', safe);
  assert.equal(validateRoleForAssignment(guild, 'r2', 'x', { rejectDangerous: true }).valid, true);
});
