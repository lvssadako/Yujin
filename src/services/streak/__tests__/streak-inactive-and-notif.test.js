const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  checkAndDisableInactiveStreaks,
  setStreakAlertPreference,
  getUserStreakStatus,
  recordMessageActivity,
  getStreakLeaderboard,
  getLocalDayInfo
} = require('../streakService');

const streakNotifCmd = require('../../../commands/utility/streaknotif');
const streakCheckCmd = require('../../../commands/utility/streakcheck');
const { readProfiles, writeProfiles, ensureUser } = require('../../../utils/profileStore');

test('streaknotif command has valid structure and methods', () => {
  assert.ok(streakNotifCmd);
  assert.equal(streakNotifCmd.data.name, 'streaknotif');
  assert.equal(typeof streakNotifCmd.execute, 'function');
  assert.equal(typeof streakNotifCmd.executePrefix, 'function');
});

test('streakcheck command has valid structure and methods', () => {
  assert.ok(streakCheckCmd);
  assert.equal(streakCheckCmd.data.name, 'streakcheck');
  assert.equal(typeof streakCheckCmd.execute, 'function');
  assert.equal(typeof streakCheckCmd.executePrefix, 'function');
});

test('setStreakAlertPreference updates and retrieves notification preference correctly', () => {
  const testGuildId = 'guild_test_notif_1';
  const testUserId = 'user_test_notif_1';

  // Desactivar alertas
  setStreakAlertPreference(testGuildId, testUserId, true);
  let status = getUserStreakStatus(testGuildId, testUserId);
  assert.equal(status.alertsDisabled, true);

  // Activar alertas
  setStreakAlertPreference(testGuildId, testUserId, false);
  status = getUserStreakStatus(testGuildId, testUserId);
  assert.equal(status.alertsDisabled, false);
});

test('streaknotif embed builders generate appropriate embeds for on, off, and status', () => {
  const mockGuild = { name: 'Test Server' };
  const mockUser = { username: 'Gamer123', displayAvatarURL: () => 'https://example.com/avatar.png' };

  const embedDisabled = streakNotifCmd.buildNotificationEmbed(mockGuild, mockUser, true, false);
  assert.ok(embedDisabled);
  assert.match(embedDisabled.data.title, /Desactivadas/i);

  const embedEnabled = streakNotifCmd.buildNotificationEmbed(mockGuild, mockUser, false, false);
  assert.ok(embedEnabled);
  assert.match(embedEnabled.data.title, /Activadas/i);

  const embedStatus = streakNotifCmd.buildNotificationEmbed(mockGuild, mockUser, true, true);
  assert.ok(embedStatus);
  assert.match(embedStatus.data.title, /DESACTIVADAS/i);
});

test('checkAndDisableInactiveStreaks detects inactive users (>=15 days) and disables their streak', () => {
  const testGuildId = 'guild_test_inactive_audit';
  const { today } = getLocalDayInfo();

  const profiles = readProfiles();
  profiles.users[testGuildId] = {
    // Usuario activo (escribió hoy)
    user_active: {
      streakDays: 10,
      lastActiveDay: today,
      streakDisabled: false
    },
    // Usuario inactivo (escribió hace 5 días -> no califica para >=15d)
    user_recent: {
      streakDays: 5,
      lastActiveDay: today - 5,
      streakDisabled: false
    },
    // Usuario inactivo (escribió hace 16 días -> califica para >=15d)
    user_inactive_16d: {
      streakDays: 20,
      lastActiveDay: today - 16,
      streakDisabled: false
    },
    // Usuario inactivo (escribió hace 30 días -> califica para >=15d)
    user_inactive_30d: {
      streakDays: 15,
      lastActiveDay: today - 30,
      streakDisabled: false
    }
  };
  writeProfiles(profiles);

  // 1. Probar en modo auditoría (dryRun = true)
  const auditResult = checkAndDisableInactiveStreaks(testGuildId, 15, true);
  assert.equal(auditResult.totalChecked, 4);
  assert.equal(auditResult.inactiveFound, 2);
  assert.equal(auditResult.disabledCount, 0); // En dry-run no modifica
  assert.equal(auditResult.dryRun, true);

  // 2. Probar en modo ejecución (dryRun = false)
  const execResult = checkAndDisableInactiveStreaks(testGuildId, 15, false);
  assert.equal(execResult.totalChecked, 4);
  assert.equal(execResult.inactiveFound, 2);
  assert.equal(execResult.disabledCount, 2);

  // 3. Verificar en base de datos
  const updatedProfiles = readProfiles();
  const uActive = updatedProfiles.users[testGuildId].user_active;
  const uRecent = updatedProfiles.users[testGuildId].user_recent;
  const u16d = updatedProfiles.users[testGuildId].user_inactive_16d;
  const u30d = updatedProfiles.users[testGuildId].user_inactive_30d;

  assert.equal(uActive.streakDisabled, false);
  assert.equal(uActive.streakDays, 10);

  assert.equal(uRecent.streakDisabled, false);
  assert.equal(uRecent.streakDays, 5);

  assert.equal(u16d.streakDisabled, true);
  assert.equal(u16d.streakDays, 0);
  assert.equal(u16d.streakPausedAt, 20);

  assert.equal(u30d.streakDisabled, true);
  assert.equal(u30d.streakDays, 0);
  assert.equal(u30d.streakPausedAt, 15);

  // 4. Verificar que getStreakLeaderboard excluye a los usuarios con racha deshabilitada
  const lb = getStreakLeaderboard(testGuildId, 10);
  const userIdsInLb = lb.top.map(u => u.userId);
  assert.ok(userIdsInLb.includes('user_active'));
  assert.ok(userIdsInLb.includes('user_recent'));
  assert.ok(!userIdsInLb.includes('user_inactive_16d'));
  assert.ok(!userIdsInLb.includes('user_inactive_30d'));
});

test('recordMessageActivity reactivates streak starting at Day 1 when inactive user sends a message', () => {
  const testGuildId = 'guild_test_reactivation';
  const testUserId = 'user_reactivated_1';
  const { today } = getLocalDayInfo();

  const profiles = readProfiles();
  profiles.users[testGuildId] = {
    [testUserId]: {
      streakDays: 0,
      streakDisabled: true,
      streakPausedAt: 25,
      lastActiveDay: today - 20
    }
  };
  writeProfiles(profiles);

  // El usuario envía un mensaje
  const result = recordMessageActivity(testGuildId, testUserId);
  assert.equal(result.updated, true);
  assert.equal(result.wasReactivated, true);
  assert.equal(result.streakDays, 1);

  // Verificar estado posterior
  const updatedStatus = getUserStreakStatus(testGuildId, testUserId);
  assert.equal(updatedStatus.streakDisabled, false);
  assert.equal(updatedStatus.streakDays, 1);
  assert.equal(updatedStatus.isActiveToday, true);
});

test('streakcheck executePrefix handles no args, numeric args, and audit mode safely', async () => {
  const mockGuild = {
    id: 'guild_prefix_streakcheck_test',
    name: 'Prefix Streak Test Guild',
    iconURL: () => 'https://example.com/icon.png'
  };

  let repliedEmbed = null;
  const createMockMsg = () => ({
    guild: mockGuild,
    member: {
      permissions: {
        has: () => true
      }
    },
    reply: async (data) => {
      repliedEmbed = data;
      return data;
    }
  });

  // 1. Sin argumentos (&streakcheck) - debe usar days=15, isDryRun=false sin lanzar error
  await streakCheckCmd.executePrefix(createMockMsg(), []);
  assert.ok(repliedEmbed && repliedEmbed.embeds);

  // 2. Solo días (&streakcheck 20)
  await streakCheckCmd.executePrefix(createMockMsg(), ['20']);
  assert.ok(repliedEmbed && repliedEmbed.embeds);

  // 3. Solo modo audit (&streakcheck audit)
  await streakCheckCmd.executePrefix(createMockMsg(), ['audit']);
  assert.ok(repliedEmbed && repliedEmbed.embeds);

  // 4. Días y modo audit (&streakcheck 30 audit)
  await streakCheckCmd.executePrefix(createMockMsg(), ['30', 'audit']);
  assert.ok(repliedEmbed && repliedEmbed.embeds);

  // 5. Argumentos nulos o undefined
  await streakCheckCmd.executePrefix(createMockMsg(), undefined);
  assert.ok(repliedEmbed && repliedEmbed.embeds);
});
