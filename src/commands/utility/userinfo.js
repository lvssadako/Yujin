const infoCmd = require('./info.js');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Muestra la información completa de un usuario (Alias de /info).')
    .addUserOption(opt => opt.setName('usuario').setDescription('El usuario a consultar').setRequired(false)),
  execute: infoCmd.execute,
  executePrefix: infoCmd.executePrefix
};
