
const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/ruleta');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ruleta')
    .setDescription('Apuesta en la ruleta.')
    .addIntegerOption(opt => opt.setName('apuesta').setDescription('Cantidad a apostar').setRequired(true))
    .addStringOption(opt => opt.setName('opcion').setDescription('rojo, negro, verde, numero').setRequired(true))
    .addIntegerOption(opt => opt.setName('numero').setDescription('Número si elegiste "numero"').setRequired(false)),
  async execute(interaction) {
     const apuesta = interaction.options.getInteger('apuesta');
     const opcion = interaction.options.getString('opcion');
     const numero = interaction.options.getInteger('numero');
     const args = [apuesta.toString(), opcion];
     if (numero !== null) args.push(numero.toString());
     
     const msg = {
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
     await prefixCmd.execute(msg, args);
  }
};
