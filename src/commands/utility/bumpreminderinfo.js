const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', '..', 'data', 'bump_reminder.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return {}; }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bumpreminderinfo')
    .setDescription('Muestra la configuración actual del recordatorio de bump'),
  async execute(interaction) {
    const config = readConfig();
    const guildId = interaction.guildId;
    const reminder = config[guildId];
    if (reminder && reminder.channelId && reminder.roleId) {
      await interaction.reply({
        content: `🔔 El recordatorio de bump está configurado para el canal <#${reminder.channelId}> y el rol <@&${reminder.roleId}>.`,
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: '⚠️ No hay recordatorio de bump configurado en este servidor.',
        ephemeral: true
      });
    }
  },

  async executePrefix(message, args, client) {
    const config = readConfig();
    const guildId = message.guild.id;
    const reminder = config[guildId];
    if (reminder && reminder.channelId && reminder.roleId) {
      await message.reply({
        content: `🔔 El recordatorio de bump está configurado para el canal <#${reminder.channelId}> y el rol <@&${reminder.roleId}>.`
      });
    } else {
      await message.reply({
        content: '⚠️ No hay recordatorio de bump configurado en este servidor.'
      });
    }
  }
};