// Comando Crash prefix (idéntico a slash, animación y edición de mensaje)
const { EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../services/economy').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');

const MIN_BET = 1;
const MAX_BET = Number.MAX_SAFE_INTEGER;
const COOLDOWN_MS = 10000;
// const DAILY_LOSS_CAP = 100000;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

function canBet(u, amount) {
  return true;
}

module.exports = {
  name: 'crash',
  description: 'Multiplicador que sube - retírate antes de que explote',
  usage: '!crash <apuesta> <objetivo>',
  async execute(message, args) {
    if (args.length < 2) return message.reply('Uso: !crash <apuesta> <objetivo>\nEjemplo: !crash 500 2.5');
    const bet = parseInt(args[0]);
    const target = parseFloat(args[1]);
    const guildId = message.guildId;
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
    if (isNaN(bet) || bet < MIN_BET) {
      return message.reply(`❌ La apuesta mínima es ${MIN_BET}.`);
    }
    if (isNaN(target) || target < 1.01 || target > 100) {
      return message.reply('❌ Objetivo debe ser un número entre 1.01 y 100.');
    }
    const { coins } = getBalance(guildId, userId);
    if (coins < bet) return message.reply(`❌ Fondos insuficientes. Tienes ${coins} 🪙.`);
    if (!canBet(u, bet)) return message.reply(`🚫 Alcanzaste el límite diario de pérdidas.`);
    if (!removeCoins(guildId, userId, bet)) return message.reply('❌ No se pudo procesar la apuesta.');
    // Crash point aleatorio
    const rand = Math.random();
    const crashPoint = Math.max(1.0, 1 / (1 - rand));
    const actualCrash = Math.min(100, Math.round(crashPoint * 100) / 100);
    const won = target <= actualCrash;
    const frames = [1.0, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0, 4.0, 5.0, 10.0];
    const relevantFrames = frames.filter(f => f <= Math.max(target, actualCrash) + 0.5);
    let sentMsg = await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle('💥 Crash')
        .setDescription('🚀 Despegando...\n**1.00x**')
        .setFooter({ text: `Apuesta: ${bet} 🪙 | Objetivo: ${target.toFixed(2)}x` })
    ] });
    const animEmbed = EmbedBuilder.from(sentMsg.embeds[0]);
    for (const frame of relevantFrames) {
      if (frame > actualCrash) break;
      await new Promise(r => setTimeout(r, 400));
      const color = frame >= target ? 0x43b581 : 0xffc107;
      animEmbed.setColor(color).setDescription(`🚀 Subiendo...\n**${frame.toFixed(2)}x**`);
      await sentMsg.edit({ embeds: [animEmbed] });
    }
    await new Promise(r => setTimeout(r, 600));
    let resultEmbed;
    if (won) {
      const gross = Math.floor(bet * target);
      addCoins(guildId, userId, gross);
      u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
      resultEmbed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle('💥 Crash - ¡GANASTE!')
        .setDescription(
          `🎯 Tu objetivo: **${target.toFixed(2)}x**\n` +
          `💥 Explotó en: **${actualCrash.toFixed(2)}x**\n\n` +
          `💰 Ganancia: **+${gross} 🪙**`
        );
    } else {
      u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
      u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + bet;
      resultEmbed = new EmbedBuilder()
        .setColor(0xdd2e44)
        .setTitle('💥 Crash - Explotó antes')
        .setDescription(
          `🎯 Tu objetivo: **${target.toFixed(2)}x**\n` +
          `💥 Explotó en: **${actualCrash.toFixed(2)}x**\n\n` +
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
