const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { levelService } = require('../index');

const levelsFile = path.join(__dirname, '..', '..', '..', '..', 'data', 'levels.json');

function cleanupGuild(guildId) {
  try {
    if (fs.existsSync(levelsFile)) {
      const data = JSON.parse(fs.readFileSync(levelsFile, 'utf8'));
      if (data.guilds && data.guilds[guildId]) {
        delete data.guilds[guildId];
        fs.writeFileSync(levelsFile, JSON.stringify(data, null, 2), 'utf8');
      }
    }
  } catch {}
}

test('levelService getDayKey and getWeekKey return valid ISO format keys', () => {
  const day = levelService.getDayKey(new Date('2026-08-30T12:00:00Z'));
  assert.equal(day, '2026-08-30');

  const week = levelService.getWeekKey(new Date('2026-08-30T12:00:00Z'));
  assert.match(week, /^2026-W\d{2}$/);
});

test('levelService adds text and voice XP with distinct daily and weekly tracking', () => {
  const guildId = 'test-guild-level';
  const userId1 = 'user-text-1';
  const userId2 = 'user-voice-2';

  cleanupGuild(guildId);

  // Add text XP
  const textResult = levelService.addXp(guildId, userId1, 50, 'text');
  assert.equal(textResult.gained, 50);

  // Add voice XP
  const voiceResult = levelService.addXp(guildId, userId2, 40, 'voice');
  assert.equal(voiceResult.gained, 40);

  levelService.addVoiceTime(guildId, userId2, 120000); // 2 mins

  const levels = levelService.readLevels();
  const u1 = levelService.getUserData(levels, guildId, userId1);
  const u2 = levelService.getUserData(levels, guildId, userId2);

  assert.equal(u1.textXp, 50);
  assert.equal(u1.daily.textXp, 50);
  assert.equal(u1.weekly.textXp, 50);

  assert.equal(u2.voiceXp, 40);
  assert.equal(u2.daily.voiceXp, 40);
  assert.equal(u2.weekly.voiceXp, 40);
  assert.equal(u2.voiceMs, 120000);

  // Test leaderboards across categories
  const generalTop = levelService.getLeaderboard(guildId, 'global', 'general', 10);
  assert.ok(generalTop.length >= 2);

  const voiceTop = levelService.getLeaderboard(guildId, 'global', 'voice', 10);
  assert.equal(voiceTop[0].id, userId2);

  const textTop = levelService.getLeaderboard(guildId, 'global', 'text', 10);
  assert.equal(textTop[0].id, userId1);

  cleanupGuild(guildId);
});

test('levelService removeXp and penalizeXp safely deduct XP and adjust levels', () => {
  const guildId = 'test-guild-penalty-xp';
  const userId = 'user-penalty-1';

  // Add 1000 XP
  levelService.addXp(guildId, userId, 1000, 'text');
  const levelsBefore = levelService.readLevels();
  const uBefore = levelService.getUserData(levelsBefore, guildId, userId);
  const initialLevel = uBefore.level;

  // Apply penalty of 300 XP
  const penaltyResult = levelService.penalizeXp(guildId, userId, 300);
  assert.equal(penaltyResult.deducted, 300);

  const levelsAfter = levelService.readLevels();
  const uAfter = levelService.getUserData(levelsAfter, guildId, userId);
  assert.ok(uAfter.xp <= uBefore.xp || uAfter.level <= initialLevel);

  // Apply huge penalty (greater than current XP)
  const hugePenalty = levelService.removeXp(guildId, userId, 999999);
  const uFloored = levelService.getUserData(levelService.readLevels(), guildId, userId);
  assert.equal(uFloored.level, 0);
  assert.equal(uFloored.xp, 0);
});

