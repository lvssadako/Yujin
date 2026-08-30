const BaseRepository = require('./baseRepository');

class EconomyRepository extends BaseRepository {
  constructor(adapter) {
    super(adapter, 'economy');
  }

  async getGuildEconomy(guildId) {
    const data = await this.all();
    return data[guildId] || {};
  }

  async getUserBalance(guildId, userId) {
    const guildData = await this.getGuildEconomy(guildId);
    const user = guildData[userId] || {};
    return {
      coins: Number(user.coins) || 0,
      bank: Number(user.bank) || 0
    };
  }

  async addCoins(guildId, userId, amount) {
    const all = await this.all();
    if (!all[guildId]) all[guildId] = {};
    if (!all[guildId][userId]) all[guildId][userId] = { coins: 0, bank: 0 };

    all[guildId][userId].coins = Math.max(0, (Number(all[guildId][userId].coins) || 0) + Number(amount));
    await this.adapter.updateAll(this.collection, all);
    return all[guildId][userId].coins;
  }

  async deductCoins(guildId, userId, amount) {
    const all = await this.all();
    if (!all[guildId] || !all[guildId][userId]) return false;

    const currentCoins = Number(all[guildId][userId].coins) || 0;
    if (currentCoins < amount) return false;

    all[guildId][userId].coins = currentCoins - amount;
    await this.adapter.updateAll(this.collection, all);
    return true;
  }

  async getLeaderboard(guildId, limit = 10) {
    const guildData = await this.getGuildEconomy(guildId);
    return Object.entries(guildData)
      .map(([userId, val]) => ({
        userId,
        coins: Number(val.coins) || 0,
        bank: Number(val.bank) || 0,
        total: (Number(val.coins) || 0) + (Number(val.bank) || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }
}

module.exports = EconomyRepository;
