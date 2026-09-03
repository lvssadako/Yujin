const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { checkAndDisableInactiveStreaks } = require('../../services/streak/streakService');
const { isOwnerOrDev } = require('../../utils/staffAuth');
const { COLORS } = require('../../utils/embedFactory');

function isStaffOrAdmin(member) {
  if (!member) return false;
  if (isOwnerOrDev(member.id)) return true;
  return Boolean(
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions?.has(PermissionFlagsBits.ModerateMembers)
  );
}

function buildStreakCheckEmbed(guild, result) {
  const isAudit = Boolean(result.dryRun);
  const embed = new EmbedBuilder()
    .setColor(isAudit ? COLORS.primary : (result.disabledCount > 0 ? COLORS.warning : COLORS.success))
    .setAuthor({
      name: `Auditoría de Rachas de Actividad · ${guild.name}`,
      iconURL: guild.iconURL({ dynamic: true })
    })
    .setTitle(
      isAudit
        ? `🔍 Reporte de Inactividad (Últimos ${result.thresholdDays} Días)`
        : `⚡ Verificación y Deshabilitación de Rachas Inactivas (≥ ${result.thresholdDays} Días)`
    )
    .setDescription(
      isAudit
        ? `Se ha realizado un análisis de actividad en **${guild.name}** sin aplicar modificaciones.`
        : `Se ha verificado la actividad del servidor y se han deshabilitado las rachas de los miembros que no escribieron en los últimos **${result.thresholdDays} días**.`
    )
    .addFields(
      {
        name: '📊 Resumen General',
        value:
          `> 👥 **Usuarios evaluados:** ${result.totalChecked}\n` +
          `> ⏳ **Inactivos detectados (≥ ${result.thresholdDays}d):** ${result.inactiveFound}\n` +
          `> ${isAudit ? '🔍 **Rachas que calificarían:**' : '🔒 **Rachas deshabilitadas:**'} ${isAudit ? result.inactiveFound : result.disabledCount}`,
        inline: false
      }
    );

  if (result.users && result.users.length > 0) {
    const topUsers = result.users.slice(0, 10);
    const userLines = topUsers.map(u => {
      const daysText = u.daysSinceLastActive >= 900 ? 'Nunca' : `${u.daysSinceLastActive} días`;
      const prevStreakText = u.previousStreak > 0 ? `🔥 ${u.previousStreak} días` : '0 días';
      const statusIcon = isAudit ? '⏳' : (u.alreadyDisabled ? '🔒' : '⛔');
      return `${statusIcon} <@${u.userId}> — Inactivo: **${daysText}** (Racha: ${prevStreakText})`;
    });

    const moreCount = result.users.length - topUsers.length;
    const moreText = moreCount > 0 ? `\n> *...y ${moreCount} usuario(s) más.*` : '';

    embed.addFields({
      name: `📋 Usuarios Inactivos (${Math.min(result.users.length, 10)} de ${result.users.length})`,
      value: userLines.join('\n') + moreText,
      inline: false
    });
  } else {
    embed.addFields({
      name: '🎉 Estado Excelente',
      value: `> ¡No se encontraron usuarios con rachas desactualizadas o inactivos por más de ${result.thresholdDays} días!`,
      inline: false
    });
  }

  embed.addFields({
    name: '💬 ¿Cómo se recupera la racha?',
    value: '> Cuando un usuario con racha deshabilitada **envíe un nuevo mensaje** en el servidor, su racha se reactivará automáticamente desde el **Día 1**.',
    inline: false
  });

  embed
    .setFooter({ text: `${guild.name} · Sistema de Rachas de Actividad` })
    .setTimestamp();

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streakcheck')
    .setDescription('Verifica usuarios inactivos en los últimos 15 días y deshabilita sus rachas hasta nuevo mensaje.')
    .addIntegerOption(opt =>
      opt.setName('dias')
        .setDescription('Días de inactividad requeridos (Por defecto: 15)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(365)
    )
    .addStringOption(opt =>
      opt.setName('modo')
        .setDescription('Modo de ejecución')
        .setRequired(false)
        .addChoices(
          { name: '⚡ Ejecutar y Deshabilitar Rachas', value: 'execute' },
          { name: '🔍 Solo Auditar (Sin cambios)', value: 'audit' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  usage: '/streakcheck [dias: 15] [modo: execute|audit]',

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Este comando solo puede utilizarse dentro de un servidor.', ephemeral: true });
    }

    if (!isStaffOrAdmin(interaction.member)) {
      return interaction.reply({
        content: '🔒 **Acceso Denegado:** Necesitas permisos de **Administrador** o **Gestionar Servidor** para auditar y gestionar las rachas.',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const days = interaction.options.getInteger('dias') || 15;
    const mode = interaction.options.getString('modo') || 'execute';
    const isDryRun = mode === 'audit';

    const result = checkAndDisableInactiveStreaks(interaction.guild.id, days, isDryRun);
    const embed = buildStreakCheckEmbed(interaction.guild, result);

    return interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Este comando solo puede utilizarse dentro de un servidor.');
    }

    if (!isStaffOrAdmin(message.member)) {
      return message.reply('🔒 **Acceso Denegado:** Necesitas permisos de **Administrador** o **Gestionar Servidor** para usar este comando.');
    }

    let days = 15;
    let isDryRun = false;

    const safeArgs = Array.isArray(args) ? args : [];

    if (safeArgs[0] && !isNaN(parseInt(safeArgs[0], 10))) {
      days = Math.max(1, Math.min(365, parseInt(safeArgs[0], 10)));
    }

    let modeArg = '';
    if (safeArgs[1]) {
      modeArg = String(safeArgs[1]).toLowerCase();
    } else if (safeArgs[0] && isNaN(parseInt(safeArgs[0], 10))) {
      modeArg = String(safeArgs[0]).toLowerCase();
    }

    if (['audit', 'dryrun', 'test', 'ver', 'check', 'solo_ver', 'auditar'].includes(modeArg)) {
      isDryRun = true;
    }

    const result = checkAndDisableInactiveStreaks(message.guild.id, days, isDryRun);
    const embed = buildStreakCheckEmbed(message.guild, result);

    return message.reply({ embeds: [embed] });
  },

  buildStreakCheckEmbed,
  isStaffOrAdmin
};
