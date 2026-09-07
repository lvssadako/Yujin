const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  VALID_CATEGORIES,
  CATEGORY_METADATA,
  getNotificationPreferences,
  setNotificationPreference,
  canSendDmNotification,
  sendDmNotification
} = require('../dmNotificationService');

const notificacionesCmd = require('../../../commands/utility/notificaciones');
const { readProfiles, writeProfiles, ensureUser } = require('../../../utils/profileStore');

const testGuildIds = [
  'test_guild_notif_default',
  'test_guild_notif_cat',
  'test_guild_notif_all',
  'test_guild_sync',
  'guild_optout_test',
  'guild_send_ok',
  'guild_closed_dm',
  'guild_prefix_test'
];

function cleanupTestGuilds() {
  try {
    const profiles = readProfiles();
    let changed = false;
    for (const gid of testGuildIds) {
      if (profiles.users && profiles.users[gid]) {
        delete profiles.users[gid];
        changed = true;
      }
    }
    if (changed) {
      writeProfiles(profiles);
    }
  } catch {}
}

test.after(() => {
  cleanupTestGuilds();
});

test('VALID_CATEGORIES contains all required categories', () => {
  assert.ok(VALID_CATEGORIES.includes('all'));
  assert.ok(VALID_CATEGORIES.includes('streaks'));
  assert.ok(VALID_CATEGORIES.includes('warns'));
  assert.ok(VALID_CATEGORIES.includes('levels'));
  assert.ok(VALID_CATEGORIES.includes('boosts'));
  assert.ok(VALID_CATEGORIES.includes('badges'));
});

test('getNotificationPreferences returns all enabled by default', () => {
  const guildId = 'test_guild_notif_default';
  const userId = 'test_user_notif_default';

  const prefs = getNotificationPreferences(guildId, userId);
  assert.equal(prefs.all, true);
  assert.equal(prefs.streaks, true);
  assert.equal(prefs.warns, true);
  assert.equal(prefs.levels, true);
  assert.equal(prefs.boosts, true);
  assert.equal(prefs.badges, true);
});

test('setNotificationPreference updates specific category and persists', () => {
  const guildId = 'test_guild_notif_cat';
  const userId = 'test_user_notif_cat';

  // Desactivar solo warns
  let updated = setNotificationPreference(guildId, userId, 'warns', false);
  assert.equal(updated.warns, false);
  assert.equal(updated.all, true);
  assert.equal(updated.streaks, true);

  assert.equal(canSendDmNotification(guildId, userId, 'warns'), false);
  assert.equal(canSendDmNotification(guildId, userId, 'streaks'), true);

  // Reactivar warns
  updated = setNotificationPreference(guildId, userId, 'warns', true);
  assert.equal(updated.warns, true);
  assert.equal(canSendDmNotification(guildId, userId, 'warns'), true);
});

test('setNotificationPreference with all: false silences everything', () => {
  const guildId = 'test_guild_notif_all';
  const userId = 'test_user_notif_all';

  const updated = setNotificationPreference(guildId, userId, 'all', false);
  assert.equal(updated.all, false);
  assert.equal(updated.streaks, false);
  assert.equal(updated.warns, false);
  assert.equal(updated.levels, false);
  assert.equal(updated.boosts, false);
  assert.equal(updated.badges, false);

  assert.equal(canSendDmNotification(guildId, userId, 'all'), false);
  assert.equal(canSendDmNotification(guildId, userId, 'streaks'), false);
  assert.equal(canSendDmNotification(guildId, userId, 'warns'), false);
});

test('setNotificationPreference synchronizes with streakAlertsDisabled', () => {
  const guildId = 'test_guild_sync';
  const userId = 'test_user_sync';

  setNotificationPreference(guildId, userId, 'streaks', false);
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  assert.equal(u.streakAlertsDisabled, true);

  setNotificationPreference(guildId, userId, 'streaks', true);
  const profiles2 = readProfiles();
  const u2 = ensureUser(profiles2, guildId, userId);
  assert.equal(u2.streakAlertsDisabled, false);
});

test('sendDmNotification ignores bots', async () => {
  const mockBot = { id: 'bot_123', bot: true, send: async () => {} };
  const res = await sendDmNotification(mockBot, { guildId: 'g1', category: 'warns', content: 'test' });
  assert.equal(res.ok, true);
  assert.equal(res.sent, false);
  assert.equal(res.reason, 'bot_target');
});

test('sendDmNotification respects user opt-out', async () => {
  const guildId = 'guild_optout_test';
  const userId = 'user_optout_test';

  setNotificationPreference(guildId, userId, 'warns', false);

  let sendCalled = false;
  const mockUser = {
    id: userId,
    bot: false,
    send: async () => { sendCalled = true; }
  };

  const res = await sendDmNotification(mockUser, { guildId, category: 'warns', content: 'test warn' });
  assert.equal(res.ok, true);
  assert.equal(res.sent, false);
  assert.equal(res.reason, 'opted_out');
  assert.equal(sendCalled, false);
});

test('sendDmNotification sends message when permitted', async () => {
  const guildId = 'guild_send_ok';
  const userId = 'user_send_ok';

  let sentPayload = null;
  const mockUser = {
    id: userId,
    bot: false,
    send: async (payload) => {
      sentPayload = payload;
      return { id: 'msg_999' };
    }
  };

  const res = await sendDmNotification(mockUser, { guildId, category: 'levels', content: '¡Subiste de nivel!' });
  assert.equal(res.ok, true);
  assert.equal(res.sent, true);
  assert.equal(res.messageId, 'msg_999');
  assert.equal(sentPayload.content, '¡Subiste de nivel!');
});

test('sendDmNotification gracefully catches closed DMs (Discord code 50007)', async () => {
  const guildId = 'guild_closed_dm';
  const userId = 'user_closed_dm';

  const mockUser = {
    id: userId,
    bot: false,
    send: async () => {
      const err = new Error('Cannot send messages to this user');
      err.code = 50007;
      throw err;
    }
  };

  const res = await sendDmNotification(mockUser, { guildId, category: 'boosts', content: 'Gracias por boostear' });
  assert.equal(res.ok, true);
  assert.equal(res.sent, false);
  assert.equal(res.reason, 'dms_closed');
});

test('notificaciones command structure and subcommands', () => {
  assert.ok(notificacionesCmd);
  assert.equal(notificacionesCmd.data.name, 'notificaciones');
  assert.equal(typeof notificacionesCmd.execute, 'function');
  assert.equal(typeof notificacionesCmd.executePrefix, 'function');

  const json = notificacionesCmd.data.toJSON();
  const subNames = json.options.map(o => o.name);
  assert.ok(subNames.includes('estado'));
  assert.ok(subNames.includes('desactivar'));
  assert.ok(subNames.includes('activar'));
});

test('notificaciones embed builders and category resolution', () => {
  const mockGuild = { name: 'Comunidad LCO' };
  const mockUser = { username: 'PlayerOne', displayAvatarURL: () => 'https://example.com/p.png' };
  const prefs = { all: true, streaks: false, warns: true, levels: true, boosts: true, badges: true };

  const statusEmbed = notificacionesCmd.buildStatusEmbed(mockGuild, mockUser, prefs);
  assert.ok(statusEmbed);
  assert.match(statusEmbed.data.title, /ACTIVAS/i);

  const offEmbed = notificacionesCmd.buildResultEmbed(mockGuild, mockUser, 'streaks', false, prefs);
  assert.ok(offEmbed);
  assert.match(offEmbed.data.title, /Desactivadas/i);

  const onEmbed = notificacionesCmd.buildResultEmbed(mockGuild, mockUser, 'all', true, prefs);
  assert.ok(onEmbed);
  assert.match(onEmbed.data.title, /Activadas/i);

  assert.equal(notificacionesCmd.resolveCategoryInput('racha'), 'streaks');
  assert.equal(notificacionesCmd.resolveCategoryInput('warns'), 'warns');
  assert.equal(notificacionesCmd.resolveCategoryInput('niveles'), 'levels');
  assert.equal(notificacionesCmd.resolveCategoryInput('boost'), 'boosts');
  assert.equal(notificacionesCmd.resolveCategoryInput('medallas'), 'badges');
  assert.equal(notificacionesCmd.resolveCategoryInput('todo'), 'all');
  assert.equal(notificacionesCmd.resolveCategoryInput('desconocido'), null);
});

test('notificaciones executePrefix handles estado, off, and on', async () => {
  const testGuild = { id: 'guild_prefix_test', name: 'Prefix Guild' };
  const testAuthor = { id: 'user_prefix_test', username: 'PrefixUser', displayAvatarURL: () => 'https://example.com/a.png' };

  let replyPayload = null;
  const mockMsg = {
    guild: testGuild,
    author: testAuthor,
    reply: async (p) => { replyPayload = p; return p; }
  };

  // 1. Estado
  await notificacionesCmd.executePrefix(mockMsg, ['estado']);
  assert.ok(replyPayload.embeds);
  assert.match(replyPayload.embeds[0].data.title, /ACTIVAS|SILENCIADAS/);

  // 2. Desactivar categoría 'streaks'
  await notificacionesCmd.executePrefix(mockMsg, ['off', 'streaks']);
  assert.ok(replyPayload.embeds);
  assert.match(replyPayload.embeds[0].data.title, /Desactivadas/);
  assert.equal(canSendDmNotification(testGuild.id, testAuthor.id, 'streaks'), false);
  assert.equal(canSendDmNotification(testGuild.id, testAuthor.id, 'warns'), true);

  // 3. Activar categoría 'streaks'
  await notificacionesCmd.executePrefix(mockMsg, ['on', 'streaks']);
  assert.ok(replyPayload.embeds);
  assert.match(replyPayload.embeds[0].data.title, /Activadas/);
  assert.equal(canSendDmNotification(testGuild.id, testAuthor.id, 'streaks'), true);
});
