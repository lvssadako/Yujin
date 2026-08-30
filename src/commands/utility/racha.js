const { SlashCommandBuilder } = require('discord.js');
const streakCmd = require('./streak');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('racha')
    .setDescription('Sistema de Rachas de Actividad por Chat (Alias de /streak)')
    .addSubcommand(sub =>
      sub.setName('ver')
        .setDescription('Muestra tu tarjeta visual de racha o la de otro usuario')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a consultar').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('customizar')
        .setDescription('Personaliza globalmente tu tarjeta de racha (Fondos, temas y colores)')
        .addStringOption(opt =>
          opt.setName('plantilla')
            .setDescription('Elige una plantilla temática de fondo')
            .setRequired(false)
            .addChoices(
              { name: '🔥 Fuego Infernal', value: 'inferno' },
              { name: '⚡ Cyberpunk Neon', value: 'cyberpunk' },
              { name: '🌌 Aurora Boreal', value: 'aurora' },
              { name: '🔮 Galaxia Cósmica', value: 'cosmic' },
              { name: '👑 Fénix Dorado', value: 'phoenix_gold' },
              { name: '🖤 Obsidiana Minimal', value: 'dark_obsidian' },
              { name: '🌸 Sakura Flame', value: 'sakura_blaze' },
              { name: '❌ Quitar Fondo', value: 'none' }
            )
        )
        .addStringOption(opt => opt.setName('fondo_url').setDescription('URL de imagen de fondo personalizada').setRequired(false))
        .addStringOption(opt => opt.setName('color_hex').setDescription('Color de acento/llama (#RRGGBB)').setRequired(false))
        .addIntegerOption(opt => opt.setName('opacidad').setDescription('Opacidad del fondo (10-100%)').setRequired(false).setMinValue(10).setMaxValue(100))
    )
    .addSubcommand(sub =>
      sub.setName('top')
        .setDescription('Muestra el Top de las rachas más largas del servidor')
    )
    .addSubcommand(sub =>
      sub.setName('niveles')
        .setDescription('Muestra los niveles de fuego y beneficios desbloqueables')
    )
    .addSubcommand(sub =>
      sub.setName('alertas')
        .setDescription('Activa o desactiva las alertas por DM antes de perder tu racha')
        .addStringOption(opt =>
          opt.setName('estado')
            .setDescription('Activar o Desactivar')
            .setRequired(true)
            .addChoices(
              { name: '🔔 Activar recordatorios por DM', value: 'on' },
              { name: '🔕 Desactivar recordatorios por DM', value: 'off' }
            )
        )
    ),

  execute: streakCmd.execute,
  executePrefix: streakCmd.executePrefix
};
