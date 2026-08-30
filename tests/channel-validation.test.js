const test = require('node:test');
const assert = require('node:assert/strict');

const { validateChannelForSending, getValidNotificationChannel } = require('../utils/channelValidation');

test('validateChannelForSending rejects non-existent channels', async () => {
  const guild = {
    channels: { cache: new Map(), fetch: () => Promise.resolve(null) },
    members: { cache: new Map() },
    client: { user: { id: 'bot-id' } }
  };

  const result = await validateChannelForSending(guild, 'nonexistent');
  assert.equal(result.valid, false);
  assert.match(result.reason, /not found|does not exist/i);
});

test('validateChannelForSending rejects non-text channels', async () => {
  const voiceChannel = {
    id: 'voice-channel',
    isTextBased: () => false
  };
  
  const guild = {
    channels: { cache: new Map([['voice-channel', voiceChannel]]), fetch: () => Promise.resolve(null) },
    members: { cache: new Map() },
    client: { user: { id: 'bot-id' } }
  };

  const result = await validateChannelForSending(guild, 'voice-channel');
  assert.equal(result.valid, false);
  assert.match(result.reason, /not a text channel/i);
});

test('validateChannelForSending accepts valid text channel', async () => {
  const botMember = { id: 'bot-id' };
  const perms = {
    has: (permsArray) => Array.isArray(permsArray) ? permsArray.every(p => ['SendMessages', 'EmbedLinks'].includes(p)) : false
  };
  
  const textChannel = {
    id: 'text-channel',
    isTextBased: () => true,
    permissionsFor: () => perms
  };
  
  const guild = {
    channels: { cache: new Map([['text-channel', textChannel]]), fetch: () => Promise.resolve(null) },
    members: { cache: new Map([['bot-id', botMember]]) },
    client: { user: { id: 'bot-id' } }
  };

  const result = await validateChannelForSending(guild, 'text-channel');
  assert.equal(result.valid, true);
  assert.equal(result.channel.id, 'text-channel');
});

test('getValidNotificationChannel picks first valid channel', async () => {
  const botMember = { id: 'bot-id' };
  const perms = {
    has: (permsArray) => Array.isArray(permsArray) ? permsArray.every(p => ['SendMessages', 'EmbedLinks'].includes(p)) : false
  };
  
  const textChannel = {
    id: 'text-channel-2',
    isTextBased: () => true,
    permissionsFor: () => perms
  };
  
  const guild = {
    channels: { cache: new Map([['text-channel-2', textChannel]]), fetch: () => Promise.resolve(null) },
    members: { cache: new Map([['bot-id', botMember]]) },
    client: { user: { id: 'bot-id' } }
  };

  const result = await getValidNotificationChannel(guild, 'nonexistent', 'text-channel-2');
  assert.equal(result?.id, 'text-channel-2');
});
