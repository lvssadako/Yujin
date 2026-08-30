const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveBoostAnnouncementChannel } = require('../events/guildMemberUpdate_boostTracker');

test('resolveBoostAnnouncementChannel prefers added channel over generic boost channel', async () => {
  const botMember = { id: 'bot-id' };
  const perms = {
    has: (permsArray) => Array.isArray(permsArray) ? permsArray.every(p => ['SendMessages', 'EmbedLinks'].includes(p)) : false
  };

  const channelA = { id: 'added-channel', isTextBased: () => true, permissionsFor: () => perms };
  const channelB = { id: 'generic-channel', isTextBased: () => true, permissionsFor: () => perms };
  const guild = {
    channels: {
      cache: new Map([
        ['added-channel', channelA],
        ['generic-channel', channelB]
      ]),
      fetch: () => Promise.resolve(null)
    },
    members: { cache: new Map([['bot-id', botMember]]) },
    client: { user: { id: 'bot-id' } }
  };

  const cfg = {
    boostAddedChannelId: 'added-channel',
    boostChannelId: 'generic-channel'
  };

  const resultAdded = await resolveBoostAnnouncementChannel(guild, cfg, 'added');
  assert.equal(resultAdded?.id, 'added-channel');

  const resultRemoved = await resolveBoostAnnouncementChannel(guild, cfg, 'removed');
  assert.equal(resultRemoved?.id, 'generic-channel');
});
