const { SlashCommandBuilder } = require('discord.js');
const rachaCmd = require('../utility/racha');
const { getStreakLeaderboard } = require('../../services/streak/streakService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streaks')
    .setDescription('Muestra el top 10 de rachas de actividad del servidor (Alias de /racha top)'),

  async execute(interaction) {
    const lb = getStreakLeaderboard(interaction.guildId, 10);
    const embed = rachaCmd.buildLeaderboardEmbed(interaction.guild, lb);
    return interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    const lb = getStreakLeaderboard(message.guild.id, 10);
    const embed = rachaCmd.buildLeaderboardEmbed(message.guild, lb);
    return message.reply({ embeds: [embed] });
  }
};