const path = require('node:path');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { withLock } = require('./economyLock');
const { validId } = require('./loanPaymentStore');
const { ensureUser } = require('../../utils/profileStore');
const { levelService } = require('../level');

function createDailyRewardService({ dataDir = path.join(__dirname, '../../../data'), now = Date.now, fault = () => {} } = {}) {
  const file = name => path.join(dataDir, name + '.json');
  const read = (name, fallback) => readJsonSafe(file(name), fallback);
  const write = (name, data) => writeJsonAtomic(file(name), data);
  const natural = n => Number.isSafeInteger(n) && n >= 0;
  function wallet(data, guildId, userId) {
    data.guilds ??= {};
    data.guilds[guildId] ??= {};
    const user = data.guilds[guildId][userId] ??= { coins: 0, gems: 0, bank: 0, inventory: {} };
    for (const name of ['coins', 'gems']) {
      user[name] ??= 0;
      if (!natural(user[name])) throw new Error('Invalid reward wallet');
    }
    return user;
  }
  function profile(data, guildId, userId) {
    data.users ??= {};
    return ensureUser(data, guildId, userId);
  }
  function syncDaily(guildId, userId, state) {
    const profiles = read('profile', { users: {}, badges: {}, globalUsers: {} });
    const user = profile(profiles, guildId, userId);
    if (!natural(state.day) || !natural(state.streak)) throw new Error('Invalid daily claim state');
    if (user.lastDailyDay === state.day && user.dailyStreak === state.streak) return;
    user.lastDailyDay = state.day;
    user.dailyStreak = state.streak;
    write('profile', profiles);
  }
  function claimDaily({ guildId, userId, day, base = 250 }) {
    if (!validId(guildId) || !validId(userId) || !natural(day) || !natural(base)) throw new Error('Invalid daily request');
    const economy = read('economy', { guilds: {} });
    const user = wallet(economy, guildId, userId);
    const profiles = read('profile', { users: {}, badges: {}, globalUsers: {} });
    const old = profile(profiles, guildId, userId);
    const previous = user.dailyReward || { day: old.lastDailyDay || 0, streak: old.dailyStreak || 0 };
    if (!natural(previous.day) || !natural(previous.streak)) throw new Error('Invalid daily claim state');
    if (previous.day >= day) {
      if (user.dailyReward) syncDaily(guildId, userId, user.dailyReward);
      return { success: false, duplicate: true, streak: previous.streak };
    }
    const streak = previous.day === day - 1 ? previous.streak + 1 : 1;
    const bonus = Math.min(1000, Math.max(0, (streak - 1) * 10));
    const total = base + bonus;
    if (!natural(user.coins + total)) throw new Error('Reward exceeds wallet range');
    user.coins += total;
    user.dailyReward = { day, streak, amount: total, timestamp: now() };
    // Currency and the authoritative claim marker are published together.
    write('economy', economy);
    fault('daily:after-wallet');
    syncDaily(guildId, userId, user.dailyReward);
    return { success: true, total, base, bonus, streak, coins: user.coins };
  }
  function validateReceipt(key, receipt) {
    if (!receipt || !natural(receipt.day) || !natural(receipt.timestamp) ||
        typeof receipt.missionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(receipt.missionId) ||
        key !== receipt.day + ':' + receipt.missionId || typeof receipt.complete !== 'boolean' ||
        !receipt.reward || !['coins', 'gems', 'xp'].every(k => natural(receipt.reward[k]))) {
      throw new Error('Invalid mission reward receipt');
    }
  }
  function validateXp(user, xp) {
    if (!natural(user.level) || !natural(user.xp) || !natural(user.xp + xp) ||
        !natural(user.daily.xp + xp) || !natural(user.weekly.xp + xp)) throw new Error('Invalid reward XP state');
  }
  function finishMission(guildId, userId, key, receipt) {
    validateReceipt(key, receipt);
    if (receipt.reward.xp) {
      const levels = read('levels', { guilds: {} });
      const user = levelService.ensureUserData(levels, guildId, userId);
      user.rewardXpClaims ??= {};
      if (!Object.hasOwn(user.rewardXpClaims, key)) {
        const xp = receipt.reward.xp;
        validateXp(user, xp);
        user.xp = (user.xp || 0) + xp;
        if (levelService.getDayKey(new Date(receipt.timestamp)) === user.daily.day) user.daily.xp += xp;
        if (levelService.getWeekKey(new Date(receipt.timestamp)) === user.weekly.week) user.weekly.xp += xp;
        while (user.xp >= levelService.xpToNext(user.level)) {
          user.xp -= levelService.xpToNext(user.level);
          user.level++;
        }
        user.rewardXpClaims[key] = receipt.timestamp;
        // Keep tokens while their currency receipts remain replayable.
        const horizon = now() - 35 * 86400000;
        const currencyClaims = read('economy', { guilds: {} }).guilds?.[guildId]?.[userId]?.missionRewardClaims || {};
        for (const [id, timestamp] of Object.entries(user.rewardXpClaims)) {
          if (timestamp < horizon && (!currencyClaims[id] || currencyClaims[id].complete)) delete user.rewardXpClaims[id];
        }
        write('levels', levels);
      }
    }
    fault('mission:after-xp');
    const missions = read('daily_missions', { guilds: {} });
    const entry = missions.guilds?.[guildId]?.[userId];
    const mission = entry?.day === receipt.day ? entry.list.find(m => m.id === receipt.missionId) : null;
    if (mission && !mission.claimed) {
      mission.claimed = true;
      write('daily_missions', missions);
    }
    fault('mission:after-claim');
    const economy = read('economy', { guilds: {} });
    wallet(economy, guildId, userId).missionRewardClaims[key].complete = true;
    write('economy', economy);
  }
  function claimMission({ guildId, userId, missionId, day }) {
    if (!validId(guildId) || !validId(userId) || typeof missionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(missionId) || !natural(day)) throw new Error('Invalid mission request');
    const economy = read('economy', { guilds: {} });
    const user = wallet(economy, guildId, userId);
    const key = day + ':' + missionId;
    user.missionRewardClaims ??= {};
    const receipt = user.missionRewardClaims[key];
    if (receipt) {
      validateReceipt(key, receipt);
      if (!receipt.complete) finishMission(guildId, userId, key, receipt);
      return null;
    }
    const missions = read('daily_missions', { guilds: {} });
    const entry = missions.guilds?.[guildId]?.[userId];
    const mission = entry?.day === day ? entry.list.find(m => m.id === missionId) : null;
    if (!mission || !mission.completed || mission.claimed) return null;
    const reward = Object.fromEntries(['coins', 'gems', 'xp'].map(k => [k, mission.reward?.[k] ?? 0]));
    if (!Object.values(reward).every(natural)) throw new Error('Invalid mission reward');
    if (!natural(user.coins + reward.coins) || !natural(user.gems + reward.gems)) throw new Error('Reward exceeds wallet range');
    if (reward.xp) {
      const levels = read('levels', { guilds: {} });
      validateXp(levelService.ensureUserData(levels, guildId, userId), reward.xp);
    }
    user.coins += reward.coins;
    user.gems += reward.gems;
    const pending = { reward, timestamp: now(), day, missionId, complete: false };
    user.missionRewardClaims[key] = pending;
    const horizon = now() - 30 * 86400000;
    for (const [id, previous] of Object.entries(user.missionRewardClaims)) {
      if (previous.complete && previous.timestamp < horizon) delete user.missionRewardClaims[id];
    }
    write('economy', economy);
    fault('mission:after-wallet');
    finishMission(guildId, userId, key, pending);
    return reward;
  }
  function recover() {
    const economy = read('economy', { guilds: {} });
    let recovered = 0;
    for (const [guildId, users] of Object.entries(economy.guilds || {})) {
      for (const [userId, user] of Object.entries(users)) {
        if (user.dailyReward) syncDaily(guildId, userId, user.dailyReward);
        for (const [key, receipt] of Object.entries(user.missionRewardClaims || {})) {
          validateReceipt(key, receipt);
          if (!receipt.complete) { finishMission(guildId, userId, key, receipt); recovered++; }
        }
      }
    }
    return recovered;
  }
  return {
    claimDaily: request => withLock(dataDir, () => claimDaily(request)),
    claimMission: request => withLock(dataDir, () => claimMission(request)),
    recover: () => withLock(dataDir, recover)
  };
}
module.exports = { createDailyRewardService, dailyRewardService: createDailyRewardService() };
