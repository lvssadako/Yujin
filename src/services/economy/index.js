const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const path = require('node:path');
const fs = require('node:fs');

function createEconomyService(options = {}) {
  const dataDir = options.dataDir || path.join(__dirname, '..', '..', '..', 'data');
  const economyPath = options.economyPath || path.join(dataDir, 'economy.json');

  function asSafeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function readEconomy() {
    const parsed = readJsonSafe(economyPath, { guilds: {} });
    if (!parsed || typeof parsed !== 'object') {
      return { guilds: {} };
    }
    parsed.guilds = parsed.guilds || {};
    return parsed;
  }

  function writeEconomy(obj) {
    fs.mkdirSync(dataDir, { recursive: true });
    writeJsonAtomic(economyPath, obj || { guilds: {} });
  }

  function ensureUserEconomy(data, guildId, userId) {
    data.guilds = data.guilds || {};
    data.guilds[guildId] = data.guilds[guildId] || {};
    data.guilds[guildId][userId] = data.guilds[guildId][userId] || { coins: 0, gems: 0 };

    const user = data.guilds[guildId][userId];
    user.coins = asSafeNumber(user.coins, 0);
    user.gems = asSafeNumber(user.gems, 0);
    return user;
  }

  function getBalance(guildId, userId) {
    const data = readEconomy();
    const guildData = data.guilds[guildId] || {};
    const user = guildData[userId] || { coins: 0, gems: 0 };
    return {
      coins: asSafeNumber(user.coins, 0),
      gems: asSafeNumber(user.gems, 0)
    };
  }

  function addCoins(guildId, userId, amount) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    const value = Math.max(0, asSafeNumber(amount, 0));
    user.coins += value;
    writeEconomy(data);
    return user.coins;
  }

  function removeCoins(guildId, userId, amount) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    const value = Math.max(0, asSafeNumber(amount, 0));
    if (user.coins < value) return false;
    user.coins -= value;
    writeEconomy(data);
    return true;
  }

  function addGems(guildId, userId, amount) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    user.gems += Math.max(0, asSafeNumber(amount, 0));
    writeEconomy(data);
    return user.gems;
  }

  return {
    readEconomy,
    writeEconomy,
    ensureUserEconomy,
    getBalance,
    addCoins,
    removeCoins,
    addGems
  };
}

const economyService = createEconomyService();

module.exports = { economyService, createEconomyService };
