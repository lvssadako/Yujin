const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const { getBalance, addCoins, removeCoins } = require('../../utils/economy');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const COOLDOWN_MS = 10_000;
const MIN_BET = 100;
const MAX_BET = 10_000;
const RAKE = 0;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

function canBet(u, amount) {
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Apuesta cara o cruz')
    .addIntegerOption(o => o
      .setName('apuesta')
      .setDescription('Cantidad a apostar')
      .setRequired(true)
      .setMinValue(MIN_BET)
      .setMaxValue(MAX_BET))
    .addStringOption(o => o
      .setName('lado')
      .setDescription('Elige cara o cruz')
      .addChoices(
        { name: 'cara', value: 'cara' },
        { name: 'cruz', value: 'cruz' }
      )
      .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const bet = interaction.options.getInteger('apuesta');
    const pick = interaction.options.getString('lado');
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const profiles = readProfiles();
    const u = ensureUser(profiles, guildId, userId);
    const now = Date.now();
    if (!u.gambleStats) u.gambleStats = { lastAt: 0, day: todayUtcDay(), lossesToday: 0, wins: 0, losses: 0 };
    if (u.gambleStats.day !== todayUtcDay()) { u.gambleStats.day = todayUtcDay(); u.gambleStats.lossesToday = 0; }
    const left = COOLDOWN_MS - (now - (u.gambleStats.lastAt || 0));
    if (left > 0) {
      const sec = Math.ceil(left / 1000);
      return interaction.editReply(`⏳ Espera ${sec}s para volver a apostar.`);
    }
    if (bet == null || bet < MIN_BET || bet > MAX_BET) {
      return interaction.editReply(`❌ Apuesta permitida: ${MIN_BET}–${MAX_BET}.`);
    }
    const { coins } = getBalance(guildId, userId);
    if (coins < bet) return interaction.editReply(`❌ Fondos insuficientes. Tienes ${coins} 🪙.`);
    // Sin límite diario de pérdidas por decisión del servidor
    if (!removeCoins(guildId, userId, bet)) return interaction.editReply('❌ No se pudo procesar la apuesta.');
    const flip = crypto.randomInt(0, 2) === 0 ? 'cara' : 'cruz';
    const win = pick === flip;
    const flipping = new EmbedBuilder()
      .setColor(0xffc107)
      .setTitle('🪙 Coinflip')
      .setDescription('🔄 Girando la moneda...')
      .setFooter({ text: `Apuesta: ${bet} 🪙 | Elegiste: ${pick}` });
    await interaction.editReply({ embeds: [flipping] });
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
    return interaction.editReply({ embeds: [resultEmbed] });
  }
};