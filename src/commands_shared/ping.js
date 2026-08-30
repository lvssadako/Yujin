// commands_shared/ping.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  name: 'ping',
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('🏓 Mide la latencia del bot.'),
  
  async executeSlash(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({ content: `🏓 Pong! Latencia: **${latency}ms**`, flags: 64 });
  },

  async executePrefix(message) {
    const latency = Date.now() - message.createdTimestamp;
    await message.reply(`🏓 Pong! Latencia: **${latency}ms**`);
  }
};
