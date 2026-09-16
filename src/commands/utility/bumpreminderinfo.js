const { SlashCommandBuilder } = require('discord.js');
const { getBumpReminder } = require('../../utils/bumpReminderStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bumpreminderinfo')
    .setDescription('Muestra la configuración actual del recordatorio de bump'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: '❌ Este comando solo puede usarse en un servidor.', ephemeral: true });
    }
    const reminder = getBumpReminder(guildId);
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
    if (!message.guild?.id) {
      return message.reply('❌ Este comando solo puede usarse en un servidor.');
    }
    const guildId = message.guild.id;
    const reminder = getBumpReminder(guildId);
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
