const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'chests.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readChests() {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { guilds: {} }; }
}

function writeChests(obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function ensureUser(chests, guildId, userId) {
  chests.guilds[guildId] = chests.guilds[guildId] || {};
  chests.guilds[guildId][userId] = chests.guilds[guildId][userId] || { chests: 0 };
  return chests.guilds[guildId][userId];
}

function addChests(guildId, userId, amount) {
  const chests = readChests();
  const user = ensureUser(chests, guildId, userId);
  user.chests = (user.chests || 0) + amount;
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