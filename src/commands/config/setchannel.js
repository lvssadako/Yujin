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
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos de administrador.');
    }
    const rawTipo = (args[0] || '').toLowerCase();
    const typeMap = {
      log: 'logChannelId',
      logs: 'logChannelId',
      mfa: 'mfaChannelId',
      alerta: 'alertChannelId',
      alertas: 'alertChannelId'
    };
    const tipo = typeMap[rawTipo];
    const channel = message.mentions.channels.first() || (args[1] ? await message.guild.channels.fetch(args[1]).catch(() => null) : null);
    if (!tipo || !channel) {
      return message.reply('❌ Uso: `&setchannel <log|mfa|alerta> #canal`');
    }
    saveChannel(tipo, channel.id);
    await message.reply(`✅ Canal ${rawTipo} establecido: <#${channel.id}>`);
  }
};