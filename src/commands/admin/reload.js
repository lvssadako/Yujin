const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { reloadCommandRegistry, syncSlashCommands } = require('../../loaders/commandLoader');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embedFactory');
const logger = require('../../utils/logger');
const path = require('node:path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Recarga todos los comandos, servicios y utilidades en caliente sin reiniciar la conexión.')
    .addBooleanOption(option =>
      option.setName('sync_discord')
        .setDescription('Forzar sincronización de comandos slash con la API de Discord')
        .setRequired(false)
    )
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
        prefixDir: path.join(__dirname, '..', '..', 'prefixCommands'),
        servicesDir: path.join(__dirname, '..', '..', 'services'),
        constantsDir: path.join(__dirname, '..', '..', 'constants'),
        utilsDir: path.join(__dirname, '..', '..', 'utils')
      };

      const registry = reloadCommandRegistry(interaction.client, paths);
      const syncDiscord = interaction.options.getBoolean('sync_discord') || false;

      let syncMsg = '';
      if (syncDiscord && process.env.TOKEN && process.env.CLIENT_ID && process.env.GUILD_ID) {
        const syncRes = await syncSlashCommands({
          token: process.env.TOKEN,
          clientId: process.env.CLIENT_ID,
          guildId: process.env.GUILD_ID,
          commandData: registry.commandData,
          force: true
        });
        syncMsg = syncRes.synced
          ? `\n🌐 Sincronizados **${syncRes.count}** comandos con la API de Discord.`
          : `\n⚠️ Error de sincronización Discord: \`${syncRes.error || syncRes.reason}\``;
      }

      const embed = createSuccessEmbed(
        '🔄 Recarga en Caliente Exitosa',
        `Se han recargado en memoria:\n• **${registry.commands.size}** comandos slash\n• **${registry.prefixCommands.size}** comandos de prefijo\n• Servicios, constantes y utilidades.${syncMsg}`
      );

      logger.info('Comandos recargados manualmente por admin', {
        user: interaction.user.tag,
        commands: registry.commands.size,
        prefix: registry.prefixCommands.size,
        syncDiscord
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error('Error al recargar comandos', { error: err.message, stack: err.stack });
      const embed = createErrorEmbed('Error', `Ocurrió un error al recargar los módulos: \`${err.message}\``);
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
        prefixDir: path.join(__dirname, '..', '..', 'prefixCommands'),
        servicesDir: path.join(__dirname, '..', '..', 'services'),
        constantsDir: path.join(__dirname, '..', '..', 'constants'),
        utilsDir: path.join(__dirname, '..', '..', 'utils')
      };

      const registry = reloadCommandRegistry(client, paths);

      const embed = createSuccessEmbed(
        '🔄 Recarga en Caliente Exitosa',
        `Se han recargado en memoria:\n• **${registry.commands.size}** comandos slash\n• **${registry.prefixCommands.size}** comandos de prefijo\n• Servicios, constantes y utilidades.`
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

