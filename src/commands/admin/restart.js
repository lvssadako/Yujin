const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embedFactory');
const { isOwnerOrDev } = require('../../utils/staffAuth');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Reinicia el proceso del bot de forma segura y controlada (Exclusivo Desarrollador/Dueño).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!isOwnerOrDev(interaction.user.id)) {
      return interaction.reply({
        content: '❌ Solo los desarrolladores o dueños del bot pueden reiniciar el proceso.',
        ephemeral: true
      });
    }

    const embed = createSuccessEmbed(
      '🔄 Reiniciando Bot',
      'El proceso del bot se está reiniciando de forma controlada...\nEstará de vuelta en unos segundos.'
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });

    logger.warn('Bot restart manual iniciado por desarrollador/dueño', {
      user: interaction.user.tag,
      userId: interaction.user.id
    });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  },

  async executePrefix(message, args, client) {
    if (!isOwnerOrDev(message.author.id)) {
      return message.reply('❌ Solo los desarrolladores o dueños del bot pueden reiniciar el proceso.');
    }

    const embed = createSuccessEmbed(
      '🔄 Reiniciando Bot',
      'El proceso del bot se está reiniciando de forma controlada...\nEstará de vuelta en unos segundos.'
    );

    await message.reply({ embeds: [embed] });

    logger.warn('Bot restart manual por prefix iniciado por administrador', {
      user: message.author.tag,
      userId: message.author.id
    });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  }
};
