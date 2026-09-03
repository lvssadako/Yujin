const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserStreakStatus, setStreakAlertPreference } = require('../../services/streak/streakService');
const { COLORS } = require('../../utils/embedFactory');

function buildNotificationEmbed(guild, user, disabled, isStatusCheck = false) {
  const embed = new EmbedBuilder().setTimestamp();

  if (isStatusCheck) {
    embed
      .setColor(disabled ? COLORS.warning : COLORS.success)
      .setAuthor({ name: `Estado de Notificaciones de Racha · ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle(disabled ? '🔕 Notificaciones de Racha: DESACTIVADAS' : '🔔 Notificaciones de Racha: ACTIVADAS')
      .setDescription(
        disabled
          ? `Actualmente **NO recibirás** mensajes directos (DM) de recordatorio ni avisos de racha en **${guild.name}**.\n\n> 💡 Para activarlas nuevamente, usa \`/streaknotif estado: Activar\` o el prefijo \`&streaknotif on\`.`
          : `Actualmente **SÍ recibirás** avisos por mensaje directo (DM) 3 horas antes de la medianoche si tu racha está en riesgo en **${guild.name}**.\n\n> 💡 Para desactivarlas, usa \`/streaknotif estado: Desactivar\` o el prefijo \`&streaknotif off\`.`
      )
      .setFooter({ text: `${guild.name} · Sistema de Rachas de Actividad` });
    return embed;
  }

  if (disabled) {
    embed
      .setColor(COLORS.error)
      .setAuthor({ name: `Notificaciones Silenciadas · ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle('🔕 Notificaciones de Racha Desactivadas')
      .setDescription(
        `Has **desactivado** con éxito las alertas automáticas de racha por mensaje directo (DM) en **${guild.name}**.\n\n` +
        `• Ya no recibirás recordatorios antes de medianoche.\n` +
        `• Tu racha seguirá contabilizándose normalmente cuando escribas en el servidor.`
      )
      .addFields({
        name: '💡 ¿Cómo volver a activarlas?',
        value: '> Puedes volver a activarlas en cualquier momento usando `/streaknotif estado: Activar` o `&streaknotif on`.',
        inline: false
      })
      .setFooter({ text: `${guild.name} · Sistema de Rachas de Actividad` });
  } else {
    embed
      .setColor(COLORS.success)
      .setAuthor({ name: `Notificaciones Activadas · ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle('🔔 Notificaciones de Racha Activadas')
      .setDescription(
        `Has **activado** con éxito las alertas automáticas de racha por mensaje directo (DM) en **${guild.name}**.\n\n` +
        `• Te enviaremos un DM de aviso 3 horas antes de la medianoche si aún no has escrito hoy y tu racha está en riesgo de perderse.`
      )
      .addFields({
        name: '🔕 ¿Cómo desactivarlas?',
        value: '> Puedes silenciarlas en cualquier momento con `/streaknotif estado: Desactivar` o `&streaknotif off`.',
        inline: false
      })
      .setFooter({ text: `${guild.name} · Sistema de Rachas de Actividad` });
  }

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streaknotif')
    .setDescription('Deshabilita o activa las notificaciones y recordatorios de racha diaria por DM.')
    .addStringOption(opt =>
      opt.setName('estado')
        .setDescription('Elige si deseas desactivar, activar o consultar el estado de tus alertas')
        .setRequired(false)
        .addChoices(
          { name: '🔕 Desactivar notificaciones (Silenciar DMs)', value: 'off' },
          { name: '🔔 Activar notificaciones (Avisos de racha)', value: 'on' },
          { name: '🔍 Consultar estado actual', value: 'status' }
        )
    ),

  usage: '/streaknotif [estado: off|on|status]',

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Este comando solo puede utilizarse dentro de un servidor.', ephemeral: true });
    }

    const guild = interaction.guild;
    const user = interaction.user;
    const currentStatus = getUserStreakStatus(guild.id, user.id);
    const option = interaction.options.getString('estado');

    if (option === 'status') {
      const embed = buildNotificationEmbed(guild, user, currentStatus.alertsDisabled, true);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    let shouldDisable = true;
    if (option === 'off') {
      shouldDisable = true;
    } else if (option === 'on') {
      shouldDisable = false;
    } else {
      shouldDisable = true;
    }

    setStreakAlertPreference(guild.id, user.id, shouldDisable);
    const embed = buildNotificationEmbed(guild, user, shouldDisable, false);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Este comando solo puede utilizarse dentro de un servidor.');
    }

    const guild = message.guild;
    const user = message.author;
    const currentStatus = getUserStreakStatus(guild.id, user.id);
    const sub = (args[0] || '').toLowerCase();

    if (['status', 'ver', 'check', 'info', 'estado'].includes(sub)) {
      const embed = buildNotificationEmbed(guild, user, currentStatus.alertsDisabled, true);
      return message.reply({ embeds: [embed] });
    }

    let shouldDisable = true;
    if (['off', 'desactivar', 'disable', 'mute', 'silenciar', 'no', 'false', '0'].includes(sub)) {
      shouldDisable = true;
    } else if (['on', 'activar', 'enable', 'unmute', 'si', 'sí', 'true', '1'].includes(sub)) {
      shouldDisable = false;
    } else {
      shouldDisable = true;
    }

    setStreakAlertPreference(guild.id, user.id, shouldDisable);
    const embed = buildNotificationEmbed(guild, user, shouldDisable, false);

    return message.reply({ embeds: [embed] });
  },

  buildNotificationEmbed
};
