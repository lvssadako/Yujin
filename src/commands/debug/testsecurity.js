const { SlashCommandBuilder } = require('discord.js');
const { onCriticalAction } = require('../../events/onCriticalAction');
const config = require('../../../config.json'); // <--- AGREGA ESTO

module.exports = {
  data: new SlashCommandBuilder()
    .setName('testsecurity')
    .setDescription('Simula una acción crítica para probar el sistema de seguridad')
    .addStringOption(opt => opt.setName('accion').setDescription('Acción (ban/kick)').setRequired(true))
    .addIntegerOption(opt => opt.setName('base').setDescription('Puntos base').setRequired(true))
    .addBooleanOption(opt => opt.setName('admin').setDescription('¿Es admin?'))
    .addIntegerOption(opt => opt.setName('hora').setDescription('Hora (0-23)'))
    .addBooleanOption(opt => opt.setName('primera').setDescription('¿Primera vez?'))
    .addIntegerOption(opt => opt.setName('dia').setDescription('Día (0-6)'))
    .addIntegerOption(opt => opt.setName('velocidad').setDescription('Acciones en último minuto')),

  async execute(interaction) {
    const ctx = {
      user: {
        isAdmin: interaction.options.getBoolean('admin') || false,
        actionHistory: interaction.options.getBoolean('primera') ? [] : ['ban'],
        activeDays: [interaction.options.getInteger('dia') ?? new Date().getDay()]
      },
      action: interaction.options.getString('accion'),
      basePoints: interaction.options.getInteger('base'),
      time: new Date(new Date().setHours(interaction.options.getInteger('hora') ?? new Date().getHours())),
      recentActions: Array(interaction.options.getInteger('velocidad') || 0).fill({ time: Date.now() }),
      bot: interaction.client,
      config: { mfaChannelId: config.mfaChannelId }, // <--- USA EL ID REAL
      executeAction: async () => {
        await interaction.reply({ content: '✅ Acción permitida por el sistema de seguridad.' });
      }
    };
    await onCriticalAction(ctx);
  },

  async executePrefix(message, args, client) {
    const accion = args[0] || 'ban';
    const basePoints = parseInt(args[1], 10) || 50;
    const ctx = {
      user: {
        isAdmin: true,
        actionHistory: ['ban'],
        activeDays: [new Date().getDay()]
      },
      action: accion,
      basePoints: basePoints,
      time: new Date(),
      recentActions: [],
      bot: client,
      config: { mfaChannelId: config.mfaChannelId },
      executeAction: async () => {
        await message.reply('✅ Acción permitida por el sistema de seguridad.');
      }
    };
    await onCriticalAction(ctx);
  }
};