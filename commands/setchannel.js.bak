const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, '..', 'config.json');

function saveChannel(type, channelId) {
  let config = {};
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  config[type] = channelId;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Establece un canal para logs, MFA o alertas')
    .addStringOption(opt => opt.setName('tipo').setDescription('Tipo: log, mfa, alerta').setRequired(true)
      .addChoices(
        { name: 'log', value: 'logChannelId' },
        { name: 'mfa', value: 'mfaChannelId' },
        { name: 'alerta', value: 'alertChannelId' }
      ))
    .addChannelOption(opt => opt.setName('canal').setDescription('Canal').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    const channel = interaction.options.getChannel('canal');
    if (!channel || channel.type !== 0) {
      return interaction.reply({ content: '❌ Debes seleccionar un canal de texto.', ephemeral: true });
    }
    saveChannel(tipo, channel.id);
    await interaction.reply({ content: `✅ Canal ${tipo.replace('ChannelId','')} establecido: <#${channel.id}>`, ephemeral: true });
  }
};