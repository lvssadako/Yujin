
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
  }
};
