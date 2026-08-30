const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/coinflip');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('coinflip')
    .setDescription('Lanza una moneda y apuesta.')
    .addIntegerOption(opt => opt.setName('apuesta').setDescription('Cantidad de monedas a apostar').setRequired(true))
    .addStringOption(opt =>
      opt.setName('cara_cruz')
        .setDescription('cara o cruz')
        .setRequired(true)
        .addChoices(
          { name: 'Cara', value: 'cara' },
          { name: 'Cruz', value: 'cruz' }
        )
    ),

  async execute(interaction) {
    const apuesta = interaction.options.getInteger('apuesta');
    const pick = interaction.options.getString('cara_cruz');
    const args = [apuesta.toString(), pick];

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
