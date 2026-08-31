const test = require('node:test');
const assert = require('node:assert/strict');
const { ActivityType } = require('discord.js');

const {
  handlePresenceUpdate,
  stopPresenceStatusRoles,
  resolveMemberTriggers,
  pendingRemove,
  userCooldown
} = require('../../events/presenceStatusRoles');

test('resolveMemberTriggers handles statusRoleTriggers array', () => {
  const cfg = {
    statusRoleTriggers: [
      { field: 'status', includes: '.gg/lco', roleId: '123456789' }
    ]
  };
  const triggers = resolveMemberTriggers(cfg);
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].roleId, '123456789');
  assert.equal(triggers[0].includes, '.gg/lco');
});

test('resolveMemberTriggers fallbacks to statusRoleId', () => {
  const cfg = {
    statusRoleId: '987654321'
  };
  const triggers = resolveMemberTriggers(cfg);
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].roleId, '987654321');
  assert.equal(triggers[0].includes, '.gg/lco');
});

test('handlePresenceUpdate ignores offline and invisible status', async () => {
  let roleAdded = false;
  const presOffline = {
    status: 'offline',
    guild: {},
    userId: 'u1',
    member: { id: 'u1', user: { bot: false }, roles: { cache: new Map(), add: () => { roleAdded = true; } } }
  };
  await handlePresenceUpdate(null, presOffline);
  assert.equal(roleAdded, false);

  const presInvisible = {
    status: 'invisible',
    guild: {},
    userId: 'u1',
    member: { id: 'u1', user: { bot: false }, roles: { cache: new Map(), add: () => { roleAdded = true; } } }
  };
  await handlePresenceUpdate(null, presInvisible);
  assert.equal(roleAdded, false);
});

test('handlePresenceUpdate ignores bot members', async () => {
  let roleAdded = false;
  const pres = {
    status: 'online',
    guild: {
      client: { user: { id: 'bot-id' } },
      members: { cache: new Map([['bot-id', { roles: { highest: { name: 'Admin' } } }]]) },
      roles: { cache: new Map([['1390080976444719104', { id: '1390080976444719104', name: 'Status Role', managed: false, comparePositionTo: () => -1 }]]), everyone: { id: '@everyone' } }
    },
    userId: 'bot-user',
    member: { id: 'bot-user', user: { bot: true }, roles: { cache: new Map(), add: () => { roleAdded = true; } } },
    activities: [{ type: ActivityType.Custom, state: 'discord.gg/lco' }]
  };

  await handlePresenceUpdate(null, pres);
  assert.equal(roleAdded, false);
});

test('handlePresenceUpdate adds role when member has target link', async () => {
  stopPresenceStatusRoles();
  let addedRoleId = null;
  const roleId = '1390080976444719104';
  const roleObj = { id: roleId, name: 'Status Role', managed: false, comparePositionTo: () => -1 };
  const botMember = { roles: { highest: { name: 'Admin' } } };

  const memberObj = {
    id: 'user-10',
    user: { id: 'user-10', tag: 'User#1234', bot: false },
    roles: {
      cache: new Map(),
      add: async (id) => { addedRoleId = id; }
    }
  };

  const guildObj = {
    id: 'guild-1',
    client: { user: { id: 'bot-id' } },
    members: {
      cache: new Map([
        ['bot-id', botMember],
        ['user-10', memberObj]
      ]),
      fetch: async () => memberObj
    },
    roles: {
      cache: new Map([[roleId, roleObj]]),
      everyone: { id: '@everyone' }
    }
  };

  const pres = {
    status: 'online',
    guild: guildObj,
    userId: 'user-10',
    member: memberObj,
    activities: [{ type: ActivityType.Custom, state: 'Visita discord.gg/lco para eventos' }]
  };

  await handlePresenceUpdate(null, pres);
  assert.equal(addedRoleId, roleId);
});

test('handlePresenceUpdate schedules delayed removal when link is missing', async () => {
  stopPresenceStatusRoles();
  const roleId = '1390080976444719104';
  const roleObj = { id: roleId, name: 'Status Role', managed: false, comparePositionTo: () => -1 };
  const botMember = { roles: { highest: { name: 'Admin' } } };

  const memberObj = {
    id: 'user-20',
    user: { id: 'user-20', tag: 'User#20', bot: false },
    roles: {
      cache: new Map([[roleId, roleObj]]),
      remove: async () => {}
    }
  };

  const guildObj = {
    id: 'guild-1',
    client: { user: { id: 'bot-id' } },
    members: {
      cache: new Map([
        ['bot-id', botMember],
        ['user-20', memberObj]
      ]),
      fetch: async () => memberObj
    },
    roles: {
      cache: new Map([[roleId, roleObj]]),
      everyone: { id: '@everyone' }
    }
  };

  const pres = {
    status: 'online',
    guild: guildObj,
    userId: 'user-20',
    member: memberObj,
    activities: [{ type: ActivityType.Custom, state: 'No link here' }]
  };

  await handlePresenceUpdate(null, pres);
  const removeKey = 'user-20:' + roleId;
  assert.equal(pendingRemove.has(removeKey), true);

  // If user adds link back, timer should be canceled
  const presWithLink = {
    status: 'online',
    guild: guildObj,
    userId: 'user-20',
    member: memberObj,
    activities: [{ type: ActivityType.Custom, state: 'discord.gg/lco' }]
  };

  // bypass cooldown for test
  userCooldown.delete('user-20');
  await handlePresenceUpdate(null, presWithLink);
  assert.equal(pendingRemove.has(removeKey), false);
});

test('stopPresenceStatusRoles clears pending timers and maps', () => {
  pendingRemove.set('u:r', setTimeout(() => {}, 10000));
  userCooldown.set('u', Date.now());

  assert.equal(pendingRemove.size, 1);
  assert.equal(userCooldown.size, 1);

  stopPresenceStatusRoles();

  assert.equal(pendingRemove.size, 0);
  assert.equal(userCooldown.size, 0);
});
