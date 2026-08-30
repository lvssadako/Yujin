const test = require('node:test');
const assert = require('node:assert/strict');

test('streak command should exist and register as a slash command', () => {
  const streakCommand = require('../../commands/utility/streak');

  assert.ok(streakCommand);
  assert.equal(streakCommand.data.name, 'streak');
  assert.equal(typeof streakCommand.execute, 'function');
});

test('generateStreakCard renders a valid AttachmentBuilder without errors', async () => {
  const { generateStreakCard } = require('../../services/streak/streakCard');
  const { getFlameTier, getNextTier } = require('../../services/streak/streakService');

  const mockUser = {
    username: 'TestUser_🔥_123',
    displayAvatarURL: () => 'https://example.com/avatar.png'
  };

  const status = {
    streakDays: 5,
    isActiveToday: true,
    currentTier: getFlameTier(5),
    nextTier: getNextTier(5),
    progressPercent: 50,
    daysToNext: 2,
    freezersCount: 1,
    streakBgUrl: '',
    streakBgOpacity: 0.65,
    streakAccent: '#FF4500'
  };

  const attachment = await generateStreakCard(mockUser, status, 'TestBot');
  assert.ok(attachment);
  assert.equal(attachment.name, 'streak-card.png');
  assert.ok(attachment.attachment);
  assert.ok(Buffer.isBuffer(attachment.attachment));
  assert.ok(attachment.attachment.length > 1000);
});

test('generateStreakCard handles maximum tier without nextTier', async () => {
  const { generateStreakCard } = require('../../services/streak/streakCard');
  const { getFlameTier, getNextTier } = require('../../services/streak/streakService');

  const mockUser = {
    username: 'LegendaryUser',
    displayAvatarURL: () => 'https://example.com/avatar.png'
  };

  const status = {
    streakDays: 100,
    isActiveToday: false,
    currentTier: getFlameTier(100),
    nextTier: getNextTier(100),
    progressPercent: 100,
    daysToNext: 0,
    freezersCount: 3,
    streakBgUrl: '',
    streakBgOpacity: 0.8,
    streakAccent: ''
  };

  const attachment = await generateStreakCard(mockUser, status, 'TestBot');
  assert.ok(attachment);
  assert.ok(attachment.attachment.length > 1000);
});

