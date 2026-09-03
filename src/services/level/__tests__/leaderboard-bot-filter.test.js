const test = require('node:test');
const assert = require('node:assert/strict');
const { levelService } = require('../index');
const { getStreakLeaderboard } = require('../../streak/streakService');
const { readProfiles, writeProfiles } = require('../../../utils/profileStore');

test('levelService.getLeaderboard excludes bots when guild is provided', () => {
  const guildId = 'test_guild_bot_filter';
  const levels = levelService.readLevels();
  levels.guilds[guildId] = {
    user_human_1: { level: 10, xp: 500 },
    user_bot_1: { level: 20, xp: 1000 },
    user_human_2: { level: 5, xp: 200 }
  };
  levelService.writeLevels(levels);

  const mockGuild = {
    members: {
      cache: new Map([
        ['user_human_1', { user: { id: 'user_human_1', bot: false } }],
        ['user_bot_1', { user: { id: 'user_bot_1', bot: true } }],
        ['user_human_2', { user: { id: 'user_human_2', bot: false } }]
      ])
    }
  };

  const top = levelService.getLeaderboard(guildId, 'global', 'general', 10, mockGuild);
  const ids = top.map(e => e.id);

  assert.ok(ids.includes('user_human_1'));
  assert.ok(ids.includes('user_human_2'));
  assert.ok(!ids.includes('user_bot_1'), 'Bot must be excluded from leaderboard');
});

test('levelService.getUserRank excludes bots when calculating rank', () => {
  const guildId = 'test_guild_rank_bot_filter';
  const levels = levelService.readLevels();
  levels.guilds[guildId] = {
    user_bot_1: { level: 50, xp: 9999 },
    user_human_1: { level: 10, xp: 500 }
  };
  levelService.writeLevels(levels);

  const mockGuild = {
    members: {
      cache: new Map([
        ['user_bot_1', { user: { id: 'user_bot_1', bot: true } }],
        ['user_human_1', { user: { id: 'user_human_1', bot: false } }]
      ])
    }
  };

  const rank = levelService.getUserRank(guildId, 'user_human_1', levels, mockGuild);
  assert.equal(rank, 1, 'Human user should be rank 1 when bot with higher level is excluded');
});

test('getStreakLeaderboard excludes bots when guild is provided', () => {
  const guildId = 'test_guild_streak_bot_filter';
  const profiles = readProfiles();
  profiles.users[guildId] = {
    user_human_streak: { streakDays: 10, lastActiveDay: 99999, streakDisabled: false },
    user_bot_streak: { streakDays: 50, lastActiveDay: 99999, streakDisabled: false }
  };
  writeProfiles(profiles);

  const mockGuild = {
    members: {
      cache: new Map([
        ['user_human_streak', { user: { id: 'user_human_streak', bot: false } }],
        ['user_bot_streak', { user: { id: 'user_bot_streak', bot: true } }]
      ])
    }
  };

  const lb = getStreakLeaderboard(guildId, 10, mockGuild);
  const ids = lb.top.map(u => u.userId);

  assert.ok(ids.includes('user_human_streak'));
  assert.ok(!ids.includes('user_bot_streak'), 'Bot must be excluded from streak leaderboard');
});
