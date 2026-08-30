const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createSuccessEmbed } = require('../../utils/embedFactory');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Reinicia el proceso del bot de forma segura y controlada.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Solo los administradores pueden ejecutar este comando.',
        ephemeral: true
      });
    }

    const embed = createSuccessEmbed(
      '🔄 Reiniciando Bot',
      'El proceso del bot se está reiniciando de forma controlada...\nEstará de vuelta en unos segundos.'
    );

    await interaction.reply({ embeds: [embed], ephemeral: true });

    logger.warn('Bot restart manual iniciado por administrador', {
      user: interaction.user.tag,
      userId: interaction.user.id
    });

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Solo los administradores pueden ejecutar este comando.');
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
