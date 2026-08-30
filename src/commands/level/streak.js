const { SlashCommandBuilder } = require('discord.js');
const rachaCmd = require('../utility/racha');
const { getUserStreakStatus } = require('../../services/streak/streakService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Consulta tu racha de actividad o la de otro usuario (Alias de /racha)')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Usuario a consultar')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options?.getUser?.('usuario') || interaction.user;
    const status = getUserStreakStatus(interaction.guildId, target.id);
    const embed = rachaCmd.buildStreakPassportEmbed(interaction.guild, target, status);
    return interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    return rachaCmd.executePrefix(message, args, client);
  }
};
