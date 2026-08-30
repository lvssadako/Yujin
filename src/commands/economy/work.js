
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Trabaja para ganar monedas (Cooldown: 4h).'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    
    const now = Date.now();
    const cooldown = 4 * 60 * 60 * 1000;
    const lastWork = user.lastWork || 0;
    
    if (now - lastWork < cooldown) {
      const left = Math.ceil((cooldown - (now - lastWork)) / 60000);
      return interaction.reply({ content: `⏳ Estás muy cansado. Vuelve a trabajar en **${left} minutos**.`, ephemeral: true });
    }
    
    const coins = Math.floor(Math.random() * 300) + 100; // 100 - 400
    user.lastWork = now;
    writeProfiles(profiles);
    addCoins(guildId, userId, coins);
    
    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)].replace('{coins}', coins);
    
    const emb = new EmbedBuilder().setColor(0x57F287).setTitle('💼 Trabajo completado').setDescription(msg);
    await interaction.reply({ embeds: [emb] });
  }
};
