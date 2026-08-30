const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const MESSAGES = [
  "Trabajaste como paseador de perros y ganaste {coins} 🪙.",
  "Ayudaste a arreglar un servidor de Discord y te pagaron {coins} 🪙.",
  "Vendiste limonada en el parque por {coins} 🪙.",
  "Programaste un bot increíble y recibiste {coins} 🪙.",
  "Hiciste un turno extra en la cafetería y conseguiste {coins} 🪙."
];

async function handleWork(guildId, userId) {
  const profiles = readProfiles();
  const user = ensureUser(profiles, guildId, userId);
  
  const now = Date.now();
  const cooldown = 4 * 60 * 60 * 1000;
  const lastWork = user.lastWork || 0;
  
  if (now - lastWork < cooldown) {
    const left = Math.ceil((cooldown - (now - lastWork)) / 60000);
    return { error: `⏳ Estás muy cansado. Vuelve a trabajar en **${left} minutos**.` };
  }
  
  const coins = Math.floor(Math.random() * 300) + 100;
  user.lastWork = now;
  writeProfiles(profiles);
  addCoins(guildId, userId, coins);
  
  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)].replace('{coins}', coins);
  const bal = getBalance(guildId, userId);
  
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: '💼 Trabajo Completado' })
    .addFields(
      { name: '💰 Ganancias', value: `> ${msg}`, inline: false },
      { name: '👛 Nuevo Balance', value: `> **${bal.coins} 🪙**`, inline: false }
    )
    .setFooter({ text: 'Vuelve en 4 horas para trabajar de nuevo' })
    .setTimestamp();
    
  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Trabaja para ganar monedas (Cooldown: 4h).'),
  async execute(interaction) {
    const result = await handleWork(interaction.guildId, interaction.user.id);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const result = await handleWork(message.guild.id, message.author.id);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
