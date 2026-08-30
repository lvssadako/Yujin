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
    if (!parsed || typeof parsed !== 'object') return { guilds: {} };
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
    data.guilds[guildId][userId] = data.guilds[guildId][userId] || { coins: 0, gems: 0, bank: 0, inventory: {} };

    const user = data.guilds[guildId][userId];
    user.coins = asSafeNumber(user.coins, 0);
    user.gems = asSafeNumber(user.gems, 0);
    user.bank = asSafeNumber(user.bank, 0);
    user.inventory = user.inventory || {};
    return user;
  }

  function getBalance(guildId, userId) {
    const data = readEconomy();
    const guildData = data.guilds[guildId] || {};
    const user = guildData[userId] || { coins: 0, gems: 0, bank: 0, inventory: {} };
    return {
      coins: asSafeNumber(user.coins, 0),
      gems: asSafeNumber(user.gems, 0),
      bank: asSafeNumber(user.bank, 0)
    };
  }

  function addCoins(guildId, userId, amount) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    user.coins += Math.max(0, asSafeNumber(amount, 0));
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

  function addBank(guildId, userId, amount) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    user.bank += Math.max(0, asSafeNumber(amount, 0));
    writeEconomy(data);
    return user.bank;
  }

  function removeBank(guildId, userId, amount) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    const value = Math.max(0, asSafeNumber(amount, 0));
    if (user.bank < value) return false;
    user.bank -= value;
    writeEconomy(data);
    return true;
  }

  function getInventory(guildId, userId) {
    const data = readEconomy();
    const guildData = data.guilds[guildId] || {};
    const user = guildData[userId] || { inventory: {} };
    return user.inventory || {};
  }

  function addItem(guildId, userId, itemId, amount = 1) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    user.inventory[itemId] = (user.inventory[itemId] || 0) + amount;
    writeEconomy(data);
    return user.inventory[itemId];
  }

  function removeItem(guildId, userId, itemId, amount = 1) {
    const data = readEconomy();
    const user = ensureUserEconomy(data, guildId, userId);
    if (!user.inventory[itemId] || user.inventory[itemId] < amount) return false;
    user.inventory[itemId] -= amount;
    if (user.inventory[itemId] <= 0) delete user.inventory[itemId];
    writeEconomy(data);
    return true;
  }

  return {
    readEconomy, writeEconomy, ensureUserEconomy,
    getBalance, addCoins, removeCoins,
    addBank, removeBank,
    getInventory, addItem, removeItem
  };
}

const economyService = createEconomyService();
module.exports = { economyService, createEconomyService };
