const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { reloadCommandRegistry } = require('../../loaders/commandLoader');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embedFactory');
const logger = require('../../utils/logger');
const path = require('node:path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Recarga todos los comandos del bot en caliente sin reiniciar la conexión.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ Solo los administradores pueden ejecutar este comando.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const paths = {
        commandsDir: path.join(__dirname, '..'),
        sharedDir: path.join(__dirname, '..', '..', 'commands_shared'),
        prefixDir: path.join(__dirname, '..', '..', 'prefixCommands')
      };

      const registry = reloadCommandRegistry(interaction.client, paths);

      const embed = createSuccessEmbed(
        '🔄 Comandos Recargados',
        `Se han recargado **${registry.commands.size}** comandos slash y **${registry.prefixCommands.size}** comandos de prefijo con éxito.`
      );

      logger.info('Comandos recargados manualmente por admin', {
        user: interaction.user.tag,
        commands: registry.commands.size,
        prefix: registry.prefixCommands.size
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Error al recargar comandos', { error: err.message, stack: err.stack });
      const embed = createErrorEmbed('Error', `Ocurrió un error al recargar los comandos: \`${err.message}\``);
      return interaction.editReply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Solo los administradores pueden ejecutar este comando.');
    }

    try {
      const paths = {
        commandsDir: path.join(__dirname, '..'),
        sharedDir: path.join(__dirname, '..', '..', 'commands_shared'),
        prefixDir: path.join(__dirname, '..', '..', 'prefixCommands')
      };

      const registry = reloadCommandRegistry(client, paths);

      const embed = createSuccessEmbed(
        '🔄 Comandos Recargados',
        `Se han recargado **${registry.commands.size}** comandos slash y **${registry.prefixCommands.size}** comandos de prefijo con éxito.`
      );

      logger.info('Comandos recargados por prefix por admin', {
        user: message.author.tag,
        commands: registry.commands.size,
        prefix: registry.prefixCommands.size
      });

      return message.reply({ embeds: [embed] });
    } catch (err) {
      logger.error('Error al recargar comandos por prefix', { error: err.message });
      return message.reply(`❌ Ocurrió un error al recargar los comandos: \`${err.message}\``);
    }
  }
};
