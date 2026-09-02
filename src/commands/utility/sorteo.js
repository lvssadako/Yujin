
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
    
    await interaction.reply({ content: '✅ ¡Sorteo iniciado con éxito!', ephemeral: true });
    await createGiveaway(interaction.channel, prize, msDur, winners, interaction.user.id);
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageEvents) && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos para crear sorteos.');
    }
    const durStr = args[0];
    const prize = args.slice(1).join(' ');
    if (!durStr || !prize) {
      return message.reply('❌ Uso: `&sorteo <duración: 10m|1h|1d> <premio>`\n*Ejemplo:* `&sorteo 1h Discord Nitro`');
    }

    let msDur = 0;
    const match = durStr.match(/^(\d+)(m|h|d)$/i);
    if (!match) return message.reply('❌ Formato de duración inválido. Usa m (minutos), h (horas), d (días). Ej: `1h` o `30m`');
    const val = parseInt(match[1]);
    if (match[2].toLowerCase() === 'm') msDur = val * 60000;
    else if (match[2].toLowerCase() === 'h') msDur = val * 3600000;
    else if (match[2].toLowerCase() === 'd') msDur = val * 86400000;

    if (msDur < 60000) return message.reply('❌ El sorteo debe durar al menos 1 minuto.');

    await message.reply('✅ ¡Sorteo iniciado con éxito!');
    await createGiveaway(message.channel, prize, msDur, 1, message.author.id);
  }
};
