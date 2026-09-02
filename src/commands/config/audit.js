
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readSettings, writeSettings } = require('../../utils/guildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Configura el canal de Auditoría (Logs de mensajes borrados/editados).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(opt => opt.setName('canal').setDescription('El canal donde se enviarán los reportes (vacío para desactivar)').setRequired(false)),
  async execute(interaction) {
    const canal = interaction.options.getChannel('canal');
    const settings = readSettings();
    if (!settings[interaction.guildId]) settings[interaction.guildId] = {};
    
    if (canal) {
      settings[interaction.guildId].auditChannel = canal.id;
      writeSettings(settings);
      await interaction.reply({ content: `🕵️ **Logs de Auditoría** configurados en <#${canal.id}>.`, ephemeral: true });
    } else {
      delete settings[interaction.guildId].auditChannel;
      writeSettings(settings);
      await interaction.reply({ content: `🕵️ **Logs de Auditoría** han sido DESACTIVADOS.`, ephemeral: true });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos de administrador.');
    }
    const settings = readSettings();
    if (!settings[message.guild.id]) settings[message.guild.id] = {};
    const channel = message.mentions.channels.first() || (args[0] && args[0] !== 'off' && args[0] !== 'desactivar' ? await message.guild.channels.fetch(args[0]).catch(() => null) : null);

    if (channel) {
      settings[message.guild.id].auditChannel = channel.id;
      writeSettings(settings);
      return message.reply(`🕵️ **Logs de Auditoría** configurados en <#${channel.id}>.`);
    } else {
      delete settings[message.guild.id].auditChannel;
      writeSettings(settings);
      return message.reply('🕵️ **Logs de Auditoría** han sido DESACTIVADOS.');
    }
  }
};
