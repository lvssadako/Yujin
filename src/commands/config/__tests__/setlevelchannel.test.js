const test = require('node:test');
const assert = require('node:assert/strict');
const setlevelchannelCmd = require('../setlevelchannel');
const { readConfig, writeConfig } = require('../../../utils/configCache');
const { ChannelType, PermissionFlagsBits } = require('discord.js');

test('setlevelchannel exports slash and prefix methods', () => {
  assert.ok(setlevelchannelCmd);
  assert.equal(setlevelchannelCmd.data.name, 'setlevelchannel');
  assert.equal(typeof setlevelchannelCmd.execute, 'function');
  assert.equal(typeof setlevelchannelCmd.executePrefix, 'function');
  assert.equal(typeof setlevelchannelCmd.buildStatusEmbed, 'function');
});

test('setlevelchannel slash command configuration flow', async () => {
  const mockGuild = {
    id: 'test_guild_setlevel',
    name: 'Test Level Server',
    iconURL: () => 'https://example.com/icon.png',
    channels: {
      cache: new Map([
        ['ch_123', { id: 'ch_123', name: 'anuncios-nivel', type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }) }]
      ])
    },
    members: {
      me: { id: 'bot_id' }
    }
  };

  // Test set
  let repliedContent = null;
  const setInteraction = {
    guild: mockGuild,
    member: {
      permissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild
      }
    },
    user: { id: 'admin_user', toString: () => '<@admin_user>' },
    options: {
      getSubcommand: () => 'set',
      getChannel: () => mockGuild.channels.cache.get('ch_123')
    },
    reply: async (data) => {
      repliedContent = data;
      return data;
    }
  };

  await setlevelchannelCmd.execute(setInteraction);
  let cfg = readConfig();
  assert.equal(cfg.levelUpChannelId, 'ch_123');
  assert.ok(repliedContent.embeds);

  // Test status
  const statusInteraction = {
    guild: mockGuild,
    member: {
      permissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild
      }
    },
    options: {
      getSubcommand: () => 'status'
    },
    reply: async (data) => {
      repliedContent = data;
      return data;
    }
  };
  await setlevelchannelCmd.execute(statusInteraction);
  assert.ok(repliedContent.embeds);

  // Test remove
  const removeInteraction = {
    guild: mockGuild,
    member: {
      permissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild
      }
    },
    options: {
      getSubcommand: () => 'remove'
    },
    reply: async (data) => {
      repliedContent = data;
      return data;
    }
  };
  await setlevelchannelCmd.execute(removeInteraction);
  cfg = readConfig();
  assert.equal(cfg.levelUpChannelId, undefined);
  assert.ok(repliedContent.embeds);
});

test('setlevelchannel prefix command configuration flow', async () => {
  const mockGuild = {
    id: 'test_guild_setlevel_prefix',
    name: 'Test Level Server',
    iconURL: () => 'https://example.com/icon.png',
    channels: {
      cache: new Map([
        ['ch_999', { id: 'ch_999', name: 'nivel-feed', type: ChannelType.GuildText, permissionsFor: () => ({ has: () => true }) }]
      ]),
      fetch: async (id) => id === 'ch_999' ? mockGuild.channels.cache.get('ch_999') : null
    },
    members: {
      me: { id: 'bot_id' }
    }
  };

  let repliedData = null;
  const mockMessage = {
    guild: mockGuild,
    member: {
      permissions: {
        has: (perm) => perm === PermissionFlagsBits.ManageGuild
      }
    },
    author: { id: 'admin_user', toString: () => '<@admin_user>' },
    mentions: {
      channels: {
        first: () => mockGuild.channels.cache.get('ch_999')
      }
    },
    reply: async (data) => {
      repliedData = data;
      return data;
    }
  };

  // Test prefix set
  await setlevelchannelCmd.executePrefix(mockMessage, ['set', '<#ch_999>']);
  let cfg = readConfig();
  assert.equal(cfg.levelUpChannelId, 'ch_999');
  assert.ok(repliedData.embeds);

  // Test prefix remove
  await setlevelchannelCmd.executePrefix(mockMessage, ['remove']);
  cfg = readConfig();
  assert.equal(cfg.levelUpChannelId, undefined);
  assert.ok(repliedData.embeds);
});
