const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');

const dataDir = path.join(__dirname, '..', 'data');
const econPath = path.join(dataDir, 'economy.json');

function asSafeNumber(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function readEconomy() {
  const parsed = readJsonSafe(econPath, { guilds: {} });
  if (!parsed || typeof parsed !== 'object') return { guilds: {} };
  parsed.guilds = parsed.guilds || {};
  return parsed;
}
function writeEconomy(obj) {
  fs.mkdirSync(dataDir, { recursive: true });
  writeJsonAtomic(econPath, obj || { guilds: {} });
}

function ensureUserEcon(econ, guildId, userId) {
  econ.guilds = econ.guilds || {};
  econ.guilds[guildId] = econ.guilds[guildId] || {};
  econ.guilds[guildId][userId] = econ.guilds[guildId][userId] || { coins: 0, gems: 0 };
  const u = econ.guilds[guildId][userId];
  u.coins = asSafeNumber(u.coins, 0);
  u.gems = asSafeNumber(u.gems, 0);
  return u;
}

function getBalance(guildId, userId) {
  const econ = readEconomy();
  const guildData = econ.guilds[guildId] || {};
  const u = guildData[userId] || { coins: 0, gems: 0 };

  if (typeof u.coins !== 'number') u.coins = 0;
  if (typeof u.gems !== 'number') u.gems = 0;

  return { coins: u.coins, gems: u.gems };
}

function addCoins(guildId, userId, amount) {
  const econ = readEconomy();
  const u = ensureUserEcon(econ, guildId, userId);
  const add = Math.max(0, asSafeNumber(amount, 0));
  u.coins += add;
  writeEconomy(econ);
  logger.info(`[addCoins] ${guildId}:${userId} +${add} => ${u.coins}`);
  return u.coins;
}

function removeCoins(guildId, userId, amount) {
  const econ = readEconomy();
  const u = ensureUserEcon(econ, guildId, userId);
  const a = Math.max(0, asSafeNumber(amount, 0));
  if (u.coins < a) return false;
  u.coins -= a;
  writeEconomy(econ);
  // misión coins_spent
  try {
    const { updateMissionProgress } = require('./dailyMissions');
    const client = require('../index').client;
    const guild = client?.guilds?.cache?.get(guildId);
    if (guild) updateMissionProgress(guild, userId, 'coins_spent', a);
  } catch {}
  return true;
}

function addGems(guildId, userId, amount) {
  const econ = readEconomy();
  const u = ensureUserEcon(econ, guildId, userId);
  u.gems += Math.max(0, asSafeNumber(amount, 0));
  writeEconomy(econ);
  return u.gems;
}

function removeGems(guildId, userId, amount) {
  const econ = readEconomy();
  const u = ensureUserEcon(econ, guildId, userId);
  const a = Math.max(0, asSafeNumber(amount, 0));
  if (u.gems < a) return false;
  u.gems -= a;
  writeEconomy(econ);
  return true;
}

function subtractCoins(guildId, userId, amount) {
  const econ = readEconomy();
  const u = ensureUserEcon(econ, guildId, userId);
  const a = Math.max(0, asSafeNumber(amount, 0));
  if (u.coins < a) return false;
  u.coins -= a;
  writeEconomy(econ);
  return true;
}

module.exports = {
  readEconomy,
  writeEconomy,
  ensureUserEcon,
  getBalance,
  addCoins,
  removeCoins,
  addGems,
  removeGems,
  subtractCoins
};