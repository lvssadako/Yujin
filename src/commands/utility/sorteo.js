
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createGiveaway } = require('../../services/giveaways/giveawayManager');


module.exports = {
  data: new SlashCommandBuilder()
    .setName('sorteo')
    .setDescription('Sistema de Sorteos (Giveaways).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addSubcommand(sub => sub.setName('empezar').setDescription('Inicia un nuevo sorteo')
      .addStringOption(opt => opt.setName('premio').setDescription('¿Qué vas a sortear?').setRequired(true))
      .addStringOption(opt => opt.setName('duracion').setDescription('Duración (ej: 1h, 30m, 1d)').setRequired(true))
      .addIntegerOption(opt => opt.setName('ganadores').setDescription('Número de ganadores').setRequired(false))),
  async execute(interaction) {
    const prize = interaction.options.getString('premio');
    const durStr = interaction.options.getString('duracion');
    const winners = interaction.options.getInteger('ganadores') || 1;
    
    // Parse duration basic
    let msDur = 0;
    const match = durStr.match(/^(\d+)(m|h|d)$/);
    if (!match) return interaction.reply({ content: '❌ Formato de duración inválido. Usa m (minutos), h (horas), d (días). Ej: `1h`', ephemeral: true });
    const val = parseInt(match[1]);
    if (match[2] === 'm') msDur = val * 60000;
    else if (match[2] === 'h') msDur = val * 3600000;
    else if (match[2] === 'd') msDur = val * 86400000;
    
    if (msDur < 60000) return interaction.reply({ content: '❌ El sorteo debe durar al menos 1 minuto.', ephemeral: true });
    
    await interaction.reply({ content: '✅ ¡Sorteo iniciado con éxito!', ephemeral: true });
    await createGiveaway(interaction.channel, prize, msDur, winners, interaction.user.id);
  }
};
