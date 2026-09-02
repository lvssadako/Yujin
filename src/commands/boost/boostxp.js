const { SlashCommandBuilder } = require('discord.js');
const { readProfiles, ensureUser } = require('../../utils/profileStore');

module.exports = {
  name: 'boostsxp',
  data: new SlashCommandBuilder()
    .setName('boostsxp')
    .setDescription('Ver boosts XP activos')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser('usuario') || interaction.user;
    const profiles = readProfiles();
    const u = ensureUser(profiles, interaction.guildId, user.id);
    let msg = '';
    
    if (Array.isArray(u.xpBoostsActive) && u.xpBoostsActive.length > 0) {
      msg += '**Boost activo:**\n';
      msg += u.xpBoostsActive.map(b => {
        const mult = typeof b.multiplier === 'number' ? b.multiplier : 1;
        const timeStr = typeof b.expiresAt === 'number' && !isNaN(b.expiresAt)
          ? `termina <t:${Math.floor(b.expiresAt / 1000)}:R>`
          : 'activo';
        return `• **${b.id || 'Boost'}**: ${mult}x (${timeStr})`;
      }).join('\n');
    } else {
      msg += 'Sin boosts activos.';
    }

    if (Array.isArray(u.xpBoostsQueue) && u.xpBoostsQueue.length > 0) {
      msg += '\n\n**En cola:**\n';
      msg += u.xpBoostsQueue.map((b, i) => {
        const mult = typeof b.multiplier === 'number' ? b.multiplier : 1;
        const durHours = typeof b.durationMs === 'number' && !isNaN(b.durationMs)
          ? `${(b.durationMs / 3600000).toFixed(1)}h`
          : '1h';
        return `${i + 1}. **${b.id || 'Boost'}**: ${mult}x por ${durHours}`;
      }).join('\n');
    }

    return interaction.reply({ content: msg, ephemeral: true });
  },

  async executePrefix(message, args, client) {
    const user = message.mentions.users.first() || (args[0] ? await client.users.fetch(args[0]).catch(() => null) : message.author);
    const profiles = readProfiles();
    const u = ensureUser(profiles, message.guild.id, user.id);
    let msg = `✨ **Boosts de XP de ${user.username}:**\n\n`;
    
    if (Array.isArray(u.xpBoostsActive) && u.xpBoostsActive.length > 0) {
      msg += '**Boost activo:**\n';
      msg += u.xpBoostsActive.map(b => {
        const mult = typeof b.multiplier === 'number' ? b.multiplier : 1;
        const timeStr = typeof b.expiresAt === 'number' && !isNaN(b.expiresAt)
          ? `termina <t:${Math.floor(b.expiresAt / 1000)}:R>`
          : 'activo';
        return `• **${b.id || 'Boost'}**: ${mult}x (${timeStr})`;
      }).join('\n');
    } else {
      msg += 'Sin boosts activos.';
    }

    if (Array.isArray(u.xpBoostsQueue) && u.xpBoostsQueue.length > 0) {
      msg += '\n\n**En cola:**\n';
      msg += u.xpBoostsQueue.map((b, i) => {
        const mult = typeof b.multiplier === 'number' ? b.multiplier : 1;
        const durHours = typeof b.durationMs === 'number' && !isNaN(b.durationMs)
          ? `${(b.durationMs / 3600000).toFixed(1)}h`
          : '1h';
        return `${i + 1}. **${b.id || 'Boost'}**: ${mult}x por ${durHours}`;
      }).join('\n');
    }

    return message.reply({ content: msg });
  }
};
