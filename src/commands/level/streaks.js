const logger = require('../src/utils/logger');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { readProfiles } = require('../../../utils/profileStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streaks')
    .setDescription('Muestra el top 10 de rachas diarias del servidor'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const profiles = readProfiles();
      const guildUsers = profiles.users?.[interaction.guildId] || {};
      
      // Filtrar usuarios con streaks activos y ordenar
      const sorted = Object.entries(guildUsers)
        .map(([id, data]) => ({
          id,
          streak: data.streakDays || 0,
          lastActive: data.lastActiveDay || 0
        }))
        .filter(u => u.streak > 0)
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 10);

      if (!sorted.length) {
        return interaction.editReply({
          content: '🔥 Nadie tiene rachas activas aún. ¡Sé el primero en enviar mensajes cada día!'
        });
      }

      // Generar líneas del ranking
      const medals = ['🥇', '🥈', '🥉'];
      const lines = sorted.map((u, i) => {
        const medal = medals[i] || `**${i + 1}.**`;
        const emoji = u.streak >= 30 ? '🔥💎' : u.streak >= 14 ? '🔥⚡' : u.streak >= 7 ? '🔥✨' : '🔥';
        return `${medal} <@${u.id}> • ${emoji} **${u.streak}** día${u.streak === 1 ? '' : 's'}`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🔥 Top 10 Rachas Diarias')
        .setDescription(lines.join('\n'))
        .setColor(0xff6b6b)
        .addFields({
          name: '📊 Estadísticas',
          value: `**Total con rachas activas:** ${Object.values(guildUsers).filter(u => (u.streakDays || 0) > 0).length}\n**Racha más larga:** ${sorted[0].streak} días`,
          inline: false
        })
        .setFooter({ text: 'Envía mensajes cada día para mantener tu racha activa' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('[streaks] Error:', err);
      return interaction.editReply({
        content: '❌ Ocurrió un error al cargar las rachas.'
      });
    }
  }
};