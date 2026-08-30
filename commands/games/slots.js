// Comando Slots independiente
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const { getBalance, addCoins, removeCoins } = require('../../utils/economy');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const MIN_BET = 100;
const MAX_BET = Number.MAX_SAFE_INTEGER;
const COOLDOWN_MS = 10000;
const RAKE = 0;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

function canBet(u, amount) {
  return true;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Tragamonedas x3')
    .addIntegerOption(o => o
      .setName('apuesta')
      .setDescription('Cantidad a apostar')
      .setRequired(true)
      .setMinValue(MIN_BET)
      .setMaxValue(MAX_BET)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const bet = interaction.options.getInteger('apuesta');
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
    if (bet == null || bet < MIN_BET) {
      return interaction.editReply(`❌ La apuesta mínima es ${MIN_BET}.`);
    }
    const { coins } = getBalance(guildId, userId);
    if (coins < bet) return interaction.editReply(`❌ Fondos insuficientes. Tienes ${coins} 🪙.`);
    // Sin límite diario de pérdidas por decisión del servidor
    if (!removeCoins(guildId, userId, bet)) return interaction.editReply('❌ No se pudo procesar la apuesta.');
    const symbols = [
      { k: '🍒', w: 35, x3: 5,  x2: 1 },
      { k: '🍋', w: 25, x3: 8,  x2: 2 },
      { k: '🍇', w: 18, x3: 12, x2: 3 },
      { k: '🔔', w: 12, x3: 20, x2: 5 },
      { k: '⭐', w: 7,  x3: 35, x2: 10 },
      { k: '💎', w: 3,  x3: 75, x2: 20 }
    ];
    const bag = [];
    symbols.forEach(s => { for (let i = 0; i < s.w; i++) bag.push(s); });
    const pull = () => bag[crypto.randomInt(0, bag.length)];
    const r1 = pull(), r2 = pull(), r3 = pull();
    const spinning = new EmbedBuilder()
      .setColor(0xffc107)
      .setTitle('🎰 Slots')
      .setDescription('🔄 Girando...\n❓ | ❓ | ❓')
      .setFooter({ text: 'Apuesta: ' + bet + ' 🪙' });
    await interaction.editReply({ embeds: [spinning] });
    await new Promise(r => setTimeout(r, 1500));
    let lines = `${r1.k} | ${r2.k} | ${r3.k}`;
    let won = 0;
    if (r1.k === r2.k && r2.k === r3.k) {
      won = bet * (r1.x3 || 0);
    } else if (r1.k === r2.k || r2.k === r3.k || r1.k === r3.k) {
      const sym = r1.k === r2.k ? r1 : (r2.k === r3.k ? r2 : r1);
      won = bet * (sym.x2 || 0);
    }
    let resultEmbed;
    if (won > 0) {
      addCoins(guildId, userId, won);
      u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
      resultEmbed = new EmbedBuilder()
        .setColor(0x43b581)
        .setTitle('🎰 Slots - ¡GANASTE!')
        .setDescription(`${lines}\n\n💰 Ganancia: **+${won} 🪙**`);
    } else {
      u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
      u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + bet;
      resultEmbed = new EmbedBuilder()
        .setColor(0xdd2e44)
        .setTitle('🎰 Slots - Perdiste')
        .setDescription(`${lines}\n\n💸 Perdiste: **-${bet} 🪙**`);
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