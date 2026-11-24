const { createEmbed } = require('../../utils/ui');
const { SlashCommandBuilder, } = require('discord.js');
const { getBalance, addCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const MESSAGES = [
  "Trabajaste como paseador de perros y ganaste {coins} 🪙.",
  "Ayudaste a arreglar un servidor de Discord y te pagaron {coins} 🪙.",
  "Vendiste limonada en el parque por {coins} 🪙.",
  "Programaste un bot increíble y recibiste {coins} 🪙.",
  "Hiciste un turno extra en la cafetería y conseguiste {coins} 🪙."
];

const { secureRandomInt, secureChoice } = require('../../utils/cryptoRandom');
const { perksFor, withBonus } = require('../../services/boost/boosterPerks');
const { readConfig } = require('../../utils/configCache');
const { money, withActor, cooldownField } = require('../../utils/economyView');

async function handleWork(guildId, userId, coinBonus = 0, discordUser = null) {
  const profiles = readProfiles();
  const user = ensureUser(profiles, guildId, userId);
  
  const now = Date.now();
  const cooldown = 4 * 60 * 60 * 1000;
  const lastWork = user.lastWork || 0;
  
  if (now - lastWork < cooldown) {
    const left = Math.ceil((cooldown - (now - lastWork)) / 60000);
    return { error: `⏳ Estás muy cansado. Vuelve a trabajar en **${left} minutos**.` };
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

  let coins = secureRandomInt(100, 400);
  coins = Math.max(1, Math.floor(coins * incomeMultiplier));
  // Beneficio de Booster: se aplica sobre el ingreso ya penalizado por préstamo (la mora sigue contando).
  const beforeBonus = coins;
  if (coinBonus > 0) coins = withBonus(coins, coinBonus);

  user.lastWork = now;
  writeProfiles(profiles);
  addCoins(guildId, userId, coins);
  
  const msg = (secureChoice(MESSAGES) || MESSAGES[0]).replace('{coins}', coins);
  const bal = getBalance(guildId, userId);
  
  const embed = withActor(createEmbed(incomeMultiplier < 1 ? 0xFBBF24 : 0x6EE7B7), discordUser, '💼 Jornada completada')
    .setDescription(msg)
    .addFields(
      { name: '💰 Ganaste', value: `+${money(coins)}`, inline: true },
      { name: '👛 Billetera', value: money(bal.coins), inline: true },
      cooldownField('Próximo turno', now + cooldown)
    )
    .setFooter({ text: 'El trabajo se renueva cada 4 horas' })
    .setTimestamp();
  if (coins > beforeBonus) {
    embed.addFields({ name: '💎 Bonus de Booster', value: `+${money(coins - beforeBonus)}`, inline: true });
  }

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
    .setName('work')
    .setDescription('Trabaja para ganar monedas (Cooldown: 4h).'),
  async execute(interaction) {
    const result = await handleWork(interaction.guildId, interaction.user.id, perksFor(interaction.member, readConfig()).coinBonus, interaction.user);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const result = await handleWork(message.guild.id, message.author.id, perksFor(message.member, readConfig()).coinBonus, message.author);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
