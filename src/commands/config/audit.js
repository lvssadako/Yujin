
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
  }
};
