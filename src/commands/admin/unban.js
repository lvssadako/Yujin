const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Desbanea a un usuario usando su ID.')
    .addStringOption(option => option.setName('id_usuario').setDescription('ID del usuario a desbanear').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('Razón del desbaneo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const userId = interaction.options.getString('id_usuario');
    const reason = interaction.options.getString('razon') || 'No especificada';

    try {
      const bans = await interaction.guild.bans.fetch();
      const bannedUser = bans.get(userId);

      if (!bannedUser) {
        return interaction.reply({ content: '❌ Ese usuario no se encuentra en la lista de baneados.', ephemeral: true });
      }

      await interaction.guild.members.unban(userId, reason);

      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('✅ Usuario Desbaneado')
        .setDescription(`**${bannedUser.user.tag}** (${userId}) ha sido desbaneado.`)
        .addFields({ name: 'Razón', value: reason })
        .setTimestamp();
        
      logger.info('Unban ejecutado', { executor: interaction.user.tag, targetId: userId, reason });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error al desbanear', { error: error.message });
      await interaction.reply({ content: '❌ Hubo un error al intentar desbanear. Verifica si el ID es correcto.', ephemeral: true });
    }
  }
};
