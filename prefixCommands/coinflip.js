// Prefix command for coinflip (adaptado para no usar interaction.deferReply)
const { EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const { getBalance, addCoins, removeCoins } = require('../utils/economy');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');

const COOLDOWN_MS = 10_000;
const MIN_BET = 100;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

function canBet(u, amount) {
  return true;
}

module.exports = {
  name: 'coinflip',
  usage: 'coinflip <apuesta> <cara|cruz>',
  description: 'Lanza una moneda y apuesta. Ej: coinflip 500 cara',
  async execute(message, args, client) {
    if (args.length < 2) return message.reply('Uso: coinflip <apuesta> <cara|cruz>');
    const bet = parseInt(args[0]);
    const pick = args[1]?.toLowerCase();
    if (isNaN(bet) || bet < MIN_BET) return message.reply(`❌ La apuesta mínima es ${MIN_BET}.`);
    if (pick !== 'cara' && pick !== 'cruz') return message.reply('Debes elegir "cara" o "cruz".');
    const guildId = message.guildId || message.guild.id;
    const userId = message.author.id;
    const profiles = readProfiles();
    const u = ensureUser(profiles, guildId, userId);
    const now = Date.now();
    if (!u.gambleStats) u.gambleStats = { lastAt: 0, day: todayUtcDay(), lossesToday: 0, wins: 0, losses: 0 };
    if (u.gambleStats.day !== todayUtcDay()) { u.gambleStats.day = todayUtcDay(); u.gambleStats.lossesToday = 0; }
    const left = COOLDOWN_MS - (now - (u.gambleStats.lastAt || 0));
    if (left > 0) {
      const sec = Math.ceil(left / 1000);
      return message.reply(`⏳ Espera ${sec}s para volver a apostar.`);
    }
    const { coins } = getBalance(guildId, userId);
    if (coins < bet) return message.reply(`❌ Fondos insuficientes. Tienes ${coins} 🪙.`);
    if (!canBet(u, bet)) return message.reply(`🚫 Alcanzaste el límite diario de pérdidas.`);
    if (!removeCoins(guildId, userId, bet)) return message.reply('❌ No se pudo procesar la apuesta.');
    const flip = crypto.randomInt(0, 2) === 0 ? 'cara' : 'cruz';
    const win = pick === flip;
    let sentMsg = await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle('🪙 Coinflip')
        .setDescription('🔄 Girando la moneda...')
        .setFooter({ text: `Apuesta: ${bet} 🪙 | Elegiste: ${pick}` })
    ] });
    await new Promise(r => setTimeout(r, 1200));
    let resultEmbed;
    if (win) {
      const payout = bet * 2;
      addCoins(guildId, userId, payout);
      u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
      resultEmbed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle('🪙 Coinflip - ¡GANASTE!')
        .setDescription(
          `🎯 Elegiste: **${pick}**\n` +
          `🪙 Salió: **${flip}**\n\n` +
          `💰 Ganancia: **+${payout} 🪙**`
        );
    } else {
      u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
      u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + bet;
      resultEmbed = new EmbedBuilder()
        .setColor(0xdd2e44)
        .setTitle('🪙 Coinflip - Perdiste')
        .setDescription(
          `🎯 Elegiste: **${pick}**\n` +
          `🪙 Salió: **${flip}**\n\n` +
          `💸 Perdiste: **-${bet} 🪙**`
        );
    }
    u.gambleStats.lastAt = now;
    writeProfiles(profiles);
    const bal = getBalance(guildId, userId).coins;
    resultEmbed.addFields(
      { name: 'Balance', value: `${bal} 🪙`, inline: true }
    ).setFooter({ text: `CD: ${Math.floor(COOLDOWN_MS / 1000)}s` });
    await sentMsg.edit({ embeds: [resultEmbed] });
  }
};
