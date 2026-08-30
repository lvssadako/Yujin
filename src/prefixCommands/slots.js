// Prefix command for slots (adaptado para no usar interaction.deferReply)
const { EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const { getBalance, addCoins, removeCoins } = require('../services/economy').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');

const MIN_BET = 100;
const COOLDOWN_MS = 10000;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

function canBet(u, amount) {
  return true;
}

module.exports = {
  name: 'slots',
  usage: 'slots <apuesta>',
  description: 'Juega a las tragamonedas. Ej: slots 500',
  async execute(message, args, client) {
    if (args.length < 1) return message.reply('Uso: slots <apuesta>');
    const bet = parseInt(args[0]);
    if (isNaN(bet) || bet < MIN_BET) return message.reply(`❌ La apuesta mínima es ${MIN_BET}.`);
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
    const symbols = [
      { k: '🍒', w: 35, x3: 5,  x2: 1 },
      { k: '🍋', w: 25, x3: 8,  x2: 2 },
      { k: '🍇', w: 18, x3: 12, x2: 3 },
      { k: '🔔', w: 12, x3: 20, x2: 5 },
      { k: '⭐', w: 7,  x3: 35, x2: 10 },
      { k: '💎', w: 3,  x3: 100, x2: 20 }
    ];
    // Generar tirada
    const pool = [];
    for (const s of symbols) for (let i = 0; i < s.w; ++i) pool.push(s.k);
    const spin = () => [0, 0, 0].map(() => pool[crypto.randomInt(pool.length)]);
    const res = spin();
    let payout = 0;
    let winType = '';
    for (const s of symbols) {
      if (res.filter(x => x === s.k).length === 3) { payout = bet * s.x3; winType = 'x3'; break; }
      if (res.filter(x => x === s.k).length === 2) { payout = bet * s.x2; winType = 'x2'; }
    }
    let sentMsg = await message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0xffc107)
        .setTitle('🎰 Slots')
        .setDescription('Girando...')
        .setFooter({ text: `Apuesta: ${bet} 🪙` })
    ] });
    await new Promise(r => setTimeout(r, 1200));
    let resultEmbed;
    if (payout > 0) {
      addCoins(guildId, userId, payout);
      u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
      resultEmbed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle('🎰 Slots - ¡GANASTE!')
        .setDescription(
          `Resultado: **${res.join(' ')}**\n` +
          `Ganancia: **+${payout} 🪙** (${winType})`
        );
    } else {
      u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
      u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + bet;
      resultEmbed = new EmbedBuilder()
        .setColor(0xdd2e44)
        .setTitle('🎰 Slots - Perdiste')
        .setDescription(
          `Resultado: **${res.join(' ')}**\n` +
          `Perdiste: **-${bet} 🪙**`
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
