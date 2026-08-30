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
