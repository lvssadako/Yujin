const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/slots');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Juega a las tragamonedas.')
    .addIntegerOption(opt =>
      opt.setName('apuesta')
        .setDescription('Cantidad de monedas a apostar')
        .setRequired(true)
        .setMinValue(10)
    ),

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
  },

  async executePrefix(message, args, client) {
    await prefixCmd.execute(message, args, client);
  }
};
