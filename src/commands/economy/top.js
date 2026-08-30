
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../../services/economy/index').economyService;
const { readProfiles } = require('../../utils/profileStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ecotop')
    .setDescription('Muestra el Top 10 de usuarios con más monedas en el servidor.'),
  async execute(interaction) {
    const profiles = readProfiles();
    const guildId = interaction.guildId;
    
    // Recolectar datos
    const usersData = [];
    for (const [uid, userProfile] of Object.entries(profiles)) {
      // Intentar ver el balance (getBalance lee de db o devuelve fallback, si per-guild)
      // Como economy service maneja balances, usamos getBalance
      const bal = getBalance(guildId, uid);
      if (bal && bal.coins > 0) {
        usersData.push({ id: uid, coins: bal.coins });
      }
    }
    
    // Sort
    usersData.sort((a, b) => b.coins - a.coins);
    const top = usersData.slice(0, 10);
    
    if (top.length === 0) {
      return interaction.reply({ content: 'No hay datos de economía todavía.', ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setTitle('🏆 Top 10 Economía')
      .setColor(0xFFD700)
      .setDescription(top.map((u, i) => `**${i + 1}.** <@${u.id}> - ${u.coins} 🪙`).join('\n'))
      .setFooter({ text: `Servidor: ${interaction.guild.name}` })
      .setTimestamp();
      
    await interaction.reply({ embeds: [embed] });
  }
};
