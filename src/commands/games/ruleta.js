const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/ruleta');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ruleta')
    .setDescription('Apuesta en la ruleta.')
    .addIntegerOption(opt => opt.setName('apuesta').setDescription('Cantidad de monedas a apostar').setRequired(true))
    .addStringOption(opt =>
      opt.setName('opcion')
        .setDescription('rojo, negro, verde, o numero')
        .setRequired(true)
        .addChoices(
          { name: 'Rojo (x2)', value: 'rojo' },
          { name: 'Negro (x2)', value: 'negro' },
          { name: 'Verde (x15)', value: 'verde' },
          { name: 'Número específico (x36)', value: 'numero' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('numero')
        .setDescription('Número del 0 al 36 si elegiste la opción "numero"')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(36)
    ),

  async execute(interaction) {
    const apuesta = interaction.options.getInteger('apuesta');
    const opcion = interaction.options.getString('opcion');
    const numero = interaction.options.getInteger('numero');
    const args = [apuesta.toString(), opcion];
    if (numero !== null) args.push(numero.toString());

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
