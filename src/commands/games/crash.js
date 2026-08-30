
const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/crash_prefix');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Juega al crash.')
    .addIntegerOption(opt => opt.setName('apuesta').setDescription('Cantidad a apostar').setRequired(true)),
  async execute(interaction) {
     const apuesta = interaction.options.getInteger('apuesta');
     const args = [apuesta.toString()];
     
     const msg = {
        guildId: interaction.guildId,
        guild: interaction.guild,
        author: interaction.user,
        channel: interaction.channel,
        reply: async (c) => {
            if (typeof c === 'string') c = { content: c };
            c.fetchReply = true;
            if (interaction.replied || interaction.deferred) return await interaction.followUp(c);
            return await interaction.reply(c);
        }
     };
     await prefixCmd.execute(msg, args, interaction.client);
  }
};
