const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInventory, addCoins, getBalance } = require('../../services/economy').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const { secureRandom, secureRandomInt } = require('../../utils/cryptoRandom');

async function handleFish(guildId, userId) {
  const inv = getInventory(guildId, userId);
  if (!inv['cana'] || inv['cana'] < 1) {
    return { error: '❌ ¡No tienes una **🎣 Caña de Pescar**! Cómprala en la tienda con `/buy`.' };
  }
  
  const profiles = readProfiles();
  const user = ensureUser(profiles, guildId, userId);
  
  const now = Date.now();
  const cooldown = 60 * 60 * 1000;
  const lastFish = user.lastFish || 0;
  
  if (now - lastFish < cooldown) {
    const left = Math.ceil((cooldown - (now - lastFish)) / 60000);
    return { error: `⏳ Los peces están asustados. Vuelve en **${left} minutos**.` };
  }

  // ── Penalización por préstamo activo ──────────────────────────────────────
  let incomeMultiplier = 1.0;
  let penaltyLevel = 0;
  try {
    const { getLoan } = require('../../services/economy/loanService');
    const loanData = getLoan(guildId, userId);
    if (loanData && loanData.active) {
      penaltyLevel = loanData.penaltyLevel || 0;
      if (penaltyLevel >= 3) incomeMultiplier = 0.25;
      else if (penaltyLevel >= 2) incomeMultiplier = 0.50;
    }
  } catch {}
  // ──────────────────────────────────────────────────────────────────────────

  user.lastFish = now;
  writeProfiles(profiles);
  
  const rand = secureRandom();
  let reward = 0;
  let msg = '';
  let color = 0x3498DB;
  
  if (rand < 0.2) {
    msg = '> Solo pescaste una bota vieja... No ganas nada. 🥾';
    color = 0x95A5A6;
  } else if (rand < 0.6) {
    reward = secureRandomInt(50, 150);
    msg = `> ¡Pescaste un pez común! Lo vendiste por **${reward} 🪙**. 🐟`;
    color = 0x2ECC71;
  } else if (rand < 0.9) {
    reward = secureRandomInt(150, 350);
    msg = `> ¡Atrapaste un pez raro! Lo vendiste por **${reward} 🪙**. 🐠`;
    color = 0x9B59B6;
  } else {
    reward = secureRandomInt(500, 1000);
    msg = `> ¡INCREÍBLE! Pescaste un **Tiburón Dorado**. Lo vendiste por **${reward} 🪙**. 🦈✨`;
    color = 0xF1C40F;
  }

  if (reward > 0) {
    reward = Math.max(1, Math.floor(reward * incomeMultiplier));
    addCoins(guildId, userId, reward);
  }
  
  const bal = getBalance(guildId, userId);
  
  const embed = new EmbedBuilder()
    .setColor(penaltyLevel >= 2 ? 0xE67E22 : color)
    .setAuthor({ name: '🎣 Día de Pesca' })
    .addFields(
      { name: '🎣 Resultado', value: msg, inline: false },
      { name: '👛 Balance Actual', value: `> **${bal.coins} 🪙**`, inline: false }
    )
    .setFooter({ text: 'Los peces regresarán en 1 hora' })
    .setTimestamp();

  if (penaltyLevel >= 2) {
    const penDescs = ['', '', 'Ingresos al 50% por préstamo en mora', 'Ingresos al 25% por préstamo en mora grave'];
    embed.addFields({
      name: `${penaltyLevel >= 3 ? '🔴' : '🔶'} Penalización Activa`,
      value: `> ${penDescs[penaltyLevel]} — Usa \`/loan repay\` para reducir tu deuda.`,
      inline: false
    });
  }
    
  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Ve a pescar y gana monedas (Requiere Caña de Pescar) (Cooldown: 1h).'),
  async execute(interaction) {
    const result = await handleFish(interaction.guildId, interaction.user.id);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const result = await handleFish(message.guild.id, message.author.id);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
