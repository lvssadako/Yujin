const test = require('node:test');
const assert = require('node:assert/strict');

const { canBotManageRole, validateRoleForAssignment } = require('../utils/roleValidation');

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
