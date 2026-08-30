
const { SlashCommandBuilder } = require('discord.js');
const prefixCmd = require('../../prefixCommands/reactduel');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactduel')
    .setDescription('Reta a otro usuario a un duelo de reacción.')
    .addUserOption(opt => opt.setName('oponente').setDescription('Usuario a retar').setRequired(true))
    .addIntegerOption(opt => opt.setName('apuesta').setDescription('Cantidad a apostar').setRequired(true)),
  async execute(interaction) {
     const target = interaction.options.getUser('oponente');
     const apuesta = interaction.options.getInteger('apuesta');
     const args = [target.id, apuesta.toString()];
     
     const msg = {
        guildId: interaction.guildId,
        guild: interaction.guild,
        author: interaction.user,
        channel: interaction.channel,
        mentions: { users: new Map([[target.id, target]]) },
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
