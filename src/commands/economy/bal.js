const balanceCmd = require('./balance.js');
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bal')
    .setDescription('Abreviación de /balance.')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver el balance de otro usuario').setRequired(false)),
  execute: balanceCmd.execute,
  executePrefix: balanceCmd.executePrefix
};
