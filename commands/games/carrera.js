// Comando Carrera (estructura base, lógica a implementar)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carrera')
    .setDescription('Apuesta a una carrera de animales')
    .addIntegerOption(o => o
      .setName('apuesta')
      .setDescription('Cantidad a apostar')
      .setRequired(true)
      .setMinValue(100)
      .setMaxValue(10000))
    .addStringOption(o => o
      .setName('animal')
      .setDescription('Elige tu animal')
      .addChoices(
        { name: '🐢 Tortuga', value: 'tortuga' },
        { name: '🐇 Liebre', value: 'liebre' },
        { name: '🐎 Caballo', value: 'caballo' },
        { name: '🦔 Erizo', value: 'erizo' }
      )
      .setRequired(true)),
  async execute(interaction) {
    // Lógica de carrera a implementar
    await interaction.reply('Carrera en desarrollo.');
  }
};