const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Aisla (timeout) a un usuario temporalmente.')
    .addUserOption(option => option.setName('usuario').setDescription('Usuario a aislar').setRequired(true))
    .addIntegerOption(option => option.setName('minutos').setDescription('Duración en minutos (1 a 40320)').setRequired(true))
    .addStringOption(option => option.setName('razon').setDescription('Razón del aislamiento').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('usuario');
    const minutes = interaction.options.getInteger('minutos');
    const reason = interaction.options.getString('razon') || 'No especificada';

    if (minutes < 1 || minutes > 40320) {
      return interaction.reply({ content: '❌ La duración debe estar entre 1 minuto y 28 días (40320 minutos).', ephemeral: true });
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return interaction.reply({ content: '❌ El usuario no está en el servidor.', ephemeral: true });
    }

    if (targetMember.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: '❌ No puedes aislar a un usuario con un rol igual o superior al tuyo.', ephemeral: true });
    }

    if (!targetMember.manageable || !targetMember.isCommunicationDisabled() === false && !interaction.guild.members.me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ No tengo permisos para aislar a este usuario (verifica la jerarquía de mis roles).', ephemeral: true });
    }

    try {
      await targetMember.timeout(minutes * 60 * 1000, reason);
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⏱️ Usuario Aislado')
        .setDescription(`**${targetUser.tag}** ha sido aislado por **${minutes} minutos**.`)
        .addFields({ name: 'Razón', value: reason })
        .setTimestamp();
        
      logger.info('Timeout aplicado', { executor: interaction.user.tag, target: targetUser.tag, minutes, reason });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error al aislar', { error: error.message });
      await interaction.reply({ content: '❌ Hubo un error al intentar aislar al usuario.', ephemeral: true });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ No tienes permisos para aislar miembros.');
    }
    const targetUser = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null);
    if (!targetUser) {
      return message.reply('❌ Uso: `&timeout @usuario <minutos> [razón]`');
    }
    const minutes = parseInt(args[1], 10);
    if (isNaN(minutes) || minutes < 1 || minutes > 40320) {
      return message.reply('❌ La duración debe ser un número entre 1 y 40320 minutos (28 días).');
    }
    const reason = args.slice(2).join(' ') || 'No especificada';

    const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return message.reply('❌ El usuario no está en el servidor.');
    }

    if (targetMember.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
      return message.reply('❌ No puedes aislar a un usuario con un rol igual o superior al tuyo.');
    }

    try {
      await targetMember.timeout(minutes * 60 * 1000, reason);
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⏱️ Usuario Aislado')
        .setDescription(`**${targetUser.tag}** ha sido aislado por **${minutes} minutos**.`)
        .addFields({ name: 'Razón', value: reason })
        .setTimestamp();
      await message.reply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error al aislar prefix', { error: error.message });
      message.reply('❌ Hubo un error al intentar aislar al usuario. Revisa mis permisos.');
    }
  }
};
