const logger = require('../src/utils/logger');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { readProfiles, ensureUser } = require('../../../utils/profileStore');
const { readConfig } = require('../../../utils/configCache');

function formatDateFromDay(dayNumber, tzOffsetMs) {
  if (!dayNumber || dayNumber <= 0) return 'Nunca';
  const ms = (dayNumber * 86400000) - tzOffsetMs;
  return new Date(ms).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Muestra tu racha diaria o la de otro usuario')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario a consultar')
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const cfg = readConfig();
      const tzOffsetMs = (cfg.timezone || 0) * 3600000;
      const today = Math.floor((Date.now() + tzOffsetMs) / 86400000);
      const targetUser = interaction.options?.getUser?.('usuario') || interaction.user;

      const profiles = readProfiles();
      const profile = ensureUser(profiles, interaction.guildId, targetUser.id);
      const streak = profile.streakDays || 0;
      const lastActive = profile.lastActiveDay || 0;
      const isActive = lastActive === today;

      const statusText = streak > 0
        ? (isActive ? '✅ Racha activa hoy' : '⚠️ Racha pausada o sin actividad hoy')
        : '💤 Sin racha activa';

      const embed = new EmbedBuilder()
        .setTitle(`🔥 Racha de ${targetUser.tag}`)
        .setDescription(`**${streak}** día${streak === 1 ? '' : 's'} consecutivos`)
        .setColor(streak > 0 ? 0xff6b6b : 0x5865f2)
        .addFields(
          { name: 'Estado', value: statusText, inline: true },
          { name: 'Última actividad', value: formatDateFromDay(lastActive, tzOffsetMs), inline: true },
          {
            name: 'Siguiente meta',
            value: streak >= 7
              ? '🔥 Ya superaste la racha base de 7 días'
              : `📈 Faltan ${Math.max(1, 7 - streak)} días para llegar a 7`,
            inline: false
          }
        )
        .setFooter({ text: 'Mantén tu racha enviando mensajes cada día' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('[streak] Error:', err);
      return interaction.editReply({
        content: '❌ Ocurrió un error al consultar la racha.'
      });
    }
  }
};
