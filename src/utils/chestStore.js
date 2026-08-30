const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'chests.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const { writeJsonAtomic, readJsonSafe } = require('./jsonStore');

function readChests() {
  return readJsonSafe(filePath, { guilds: {} });
}

function writeChests(obj) {
  writeJsonAtomic(filePath, obj || { guilds: {} });
}

function ensureUser(chests, guildId, userId) {
  chests.guilds[guildId] = chests.guilds[guildId] || {};
  chests.guilds[guildId][userId] = chests.guilds[guildId][userId] || { chests: 0 };
  return chests.guilds[guildId][userId];
}

function addChests(guildId, userId, amount) {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (safeAmount <= 0) return getChestCount(guildId, userId);
  const chests = readChests();
  const user = ensureUser(chests, guildId, userId);
  user.chests = (user.chests || 0) + safeAmount;
  writeChests(chests);
  return user.chests;
}

function removeChest(guildId, userId) {
  const chests = readChests();
  const user = ensureUser(chests, guildId, userId);
  if ((user.chests || 0) < 1) return false;
  user.chests -= 1;
  writeChests(chests);
  return true;
}

function getChestCount(guildId, userId) {
  const chests = readChests();
  const user = chests.guilds[guildId]?.[userId];
  return user?.chests || 0;
}

module.exports = { addChests, removeChest, getChestCount };