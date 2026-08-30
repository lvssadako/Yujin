const { SlashCommandBuilder } = require('discord.js');
const { readProfiles, ensureUser } = require('../../../utils/profileStore');

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
    if (u.xpBoostsActive.length) {
      msg += '**Boost activo:**\n';
      msg += u.xpBoostsActive.map(b =>
        `${b.id}: ${b.multiplier}x termina <t:${Math.floor(b.expiresAt/1000)}:R>`).join('\n');
    } else {
      msg += 'Sin boosts activos.';
    }
    if (u.xpBoostsQueue && u.xpBoostsQueue.length) {
      msg += '\n\n**En cola:**\n';
      msg += u.xpBoostsQueue.map((b, i) =>
        `${i+1}. ${b.id}: ${b.multiplier}x por ${(b.durationMs/3600000).toFixed(1)}h`).join('\n');
    }
    return interaction.reply(msg);
  }
};