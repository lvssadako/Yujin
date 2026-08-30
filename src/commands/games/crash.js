const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/crash_prefix');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Juega al crash: multiplica tu apuesta retirándote antes del crash.')
    .addIntegerOption(opt =>
      opt.setName('apuesta')
        .setDescription('Cantidad de monedas a apostar')
        .setRequired(true)
        .setMinValue(1)
    )
    .addNumberOption(opt =>
      opt.setName('multiplicador')
        .setDescription('Multiplicador objetivo para retirarte (ej: 2.0)')
        .setRequired(false)
        .setMinValue(1.01)
        .setMaxValue(100)
    ),

  async execute(interaction) {
    const apuesta = interaction.options.getInteger('apuesta');
    const multiplicador = interaction.options.getNumber('multiplicador') || 2.0;
    const args = [apuesta.toString(), multiplicador.toString()];

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
