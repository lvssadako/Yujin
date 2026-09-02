
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readSettings, writeSettings } = require('../../utils/guildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Activa o desactiva el sistema de Automoderación.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption(opt => opt.setName('estado').setDescription('True para activar, False para desactivar').setRequired(true)),
  async execute(interaction) {
    const estado = interaction.options.getBoolean('estado');
    const settings = readSettings();
    if (!settings[interaction.guildId]) settings[interaction.guildId] = {};
    settings[interaction.guildId].automodEnabled = estado;
    writeSettings(settings);
    
    await interaction.reply({ content: `🛡️ **Automoderación** (Anti-Spam y Anti-Links) ha sido ${estado ? 'ACTIVADA ✅' : 'DESACTIVADA ❌'}.`, ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos de administrador.');
    }
    const val = (args[0] || '').toLowerCase();
    const estado = val === 'on' || val === 'true' || val === 'activar' || val === '1';
    const settings = readSettings();
    if (!settings[message.guild.id]) settings[message.guild.id] = {};
    settings[message.guild.id].automodEnabled = estado;
    writeSettings(settings);

    return message.reply(`🛡️ **Automoderación** (Anti-Spam y Anti-Links) ha sido ${estado ? 'ACTIVADA ✅' : 'DESACTIVADA ❌'}.`);
  }
};
