const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testbutton')
    .setDescription('Comando de prueba de botón'),
  async execute(interaction) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('test_btn')
        .setLabel('Pruébame')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ content: 'Prueba el botón:', components: [row] });
  }
};