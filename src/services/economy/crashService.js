const path = require('node:path');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { withLock } = require('./economyLock');
const { validId } = require('./loanPaymentStore');
const { secureRandom } = require('../../utils/cryptoRandom');

function createCrashService({ dataDir = path.join(__dirname, '../../../data'), now = Date.now, random = secureRandom } = {}) {
  const file = path.join(dataDir, 'economy.json');
  function play({ guildId, userId, bet, target, deliveryId, legacyStats = {} }) {
    if (!validId(guildId) || !validId(userId) || typeof deliveryId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(deliveryId)) {
      return { error: 'No pude identificar esta apuesta.' };
    }
    if (!Number.isSafeInteger(bet) || bet < 1 || !Number.isFinite(target) || target < 1.01 || target > 100) {
      return { error: 'La apuesta o el multiplicador no son validos.' };
    }
    const data = readJsonSafe(file, { guilds: {} });
    const user = data.guilds?.[guildId]?.[userId];
    if (!user || !Number.isSafeInteger(user.coins) || user.coins < 0) return { error: 'No hay un saldo valido para apostar.' };
    user.crashReceipts ??= {};
    const previous = user.crashReceipts[deliveryId];
    if (previous) {
      if (previous.bet !== bet || previous.target !== target) return { error: 'Esta apuesta ya fue registrada con otros valores.' };
      return { ...previous.result, duplicate: true };
    }
    const timestamp = now(), day = Math.floor(timestamp / 86400000);
    const stats = { ...(user.crashStats || legacyStats) };
    for (const key of ['wins', 'losses', 'lossesToday', 'lastAt']) {
      stats[key] ??= 0;
      if (!Number.isSafeInteger(stats[key]) || stats[key] < 0) throw new Error('Invalid crash statistics');
    }
    const left = 10000 - (timestamp - (stats.lastAt || 0));
    if (left > 0) return { error: 'Espera ' + Math.ceil(left / 1000) + 's para volver a apostar.' };
    if (user.coins < bet) return { error: 'Fondos insuficientes para esta apuesta.' };
    const rand = random();
    if (!Number.isFinite(rand) || rand < 0 || rand >= 1) throw new Error('Invalid crash entropy');
    const crashPoint = Math.min(100, Math.round(Math.max(1, 1 / (1 - Math.min(0.99, rand))) * 100) / 100);
    const won = target <= crashPoint, gross = won ? Math.floor(bet * target) : 0;
    const coins = user.coins - bet + gross;
    if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(coins)) return { error: 'La apuesta supera el limite de saldo permitido.' };
    if (stats.day !== day) { stats.day = day; stats.lossesToday = 0; }
    stats.lastAt = timestamp;
    if (won) stats.wins = (stats.wins || 0) + 1;
    else { stats.losses = (stats.losses || 0) + 1; stats.lossesToday = (stats.lossesToday || 0) + bet; }
    const result = { won, gross, bet, target, crashPoint, coins, stats };
    user.coins = coins;
    user.crashStats = stats;
    user.crashReceipts[deliveryId] = { timestamp, bet, target, result };
    const receipts = Object.entries(user.crashReceipts).sort((a,b) => b[1].timestamp - a[1].timestamp);
    user.crashReceipts = Object.fromEntries(receipts.filter(([,r],i) => i < 200 && timestamp - r.timestamp < 86400000));
    // Debit, payout and receipt are published in one economic write before animation.
    writeJsonAtomic(file, data);
    return result;
  }
  return { play: request => withLock(dataDir, () => play(request)) };
}
module.exports = { createCrashService, crashService: createCrashService() };
