const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrDev, getStaffRole } = require('../../utils/staffAuth');
const { getRecentProblemLogs } = require('../../utils/logReader');
const { createErrorEmbed } = require('../../utils/embedFactory');

function formatLogEntry(log, index) {
  const isError = (log.level || '').toLowerCase() === 'error';
  const icon = isError ? '🔴' : '⚠️';
  const levelTag = isError ? '**ERROR**' : '**WARN**';
  const timestamp = log.timestamp || 'N/A';
  const message = log.message || log.error || 'Sin mensaje descriptivo';

  let detail = '';
  if (log.error && log.error !== log.message) {
    detail += `\n> *Detalle:* \`${String(log.error).slice(0, 100)}\``;
  }
  if (log.stack) {
    const firstStackLine = String(log.stack).split('\n')[1]?.trim() || '';
    if (firstStackLine) {
      detail += `\n> *Stack:* \`${firstStackLine.slice(0, 80)}\``;
    }
  }

  return `${icon} \`[${timestamp}]\` ${levelTag}: **${message.slice(0, 90)}**${detail}`;
}

async function renderLogsEmbed(client, user, filter = 'all', limit = 15) {
  const staffRole = getStaffRole(user.id);
  const logs = getRecentProblemLogs({ limit, filter });

  if (logs.length === 0) {
    return new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '📜 Registro de Errores y Advertencias', iconURL: client.user.displayAvatarURL() })
      .setDescription(
        `> 👤 **Autenticado:** ${staffRole} (<@${user.id}>)\n\n` +
        '✅ **¡Todo en orden!** No se encontraron errores ni advertencias recientes en los archivos de registro.'
      )
      .setFooter({ text: 'Sistema de logs sin incidentes recientes' })
      .setTimestamp();
  }

  const formattedLines = logs.map((log, idx) => formatLogEntry(log, idx));
  
  // Dividir si excede los límites de Discord
  const chunks = [];
  let currentChunk = '';
  for (const line of formattedLines) {
    if ((currentChunk + '\n\n' + line).length > 3800) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n\n' + line : line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  const embed = new EmbedBuilder()
    .setColor(logs.some(l => l.level === 'error') ? 0xED4245 : 0xF1C40F)
    .setAuthor({
      name: `📜 Últimos ${logs.length} Incidentes (Errores / Advertencias)`,
      iconURL: client.user.displayAvatarURL()
    })
    .setDescription(
      `> 👤 **Solicitado por:** ${staffRole} (<@${user.id}>)\n` +
      `> 🔍 **Filtro aplicado:** \`${filter.toUpperCase()}\` · **Mostrando:** ${logs.length} registros más recientes\n\n` +
      chunks[0]
    )
    .setFooter({ text: 'Logs ordenados de más reciente a más antiguo' })
    .setTimestamp();

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Muestra los últimos 15 errores y advertencias registrados en el sistema.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('filtro')
        .setDescription('Filtrar tipo de incidente')
        .setRequired(false)
        .addChoices(
          { name: 'Todos (Errores + Advertencias)', value: 'all' },
          { name: 'Solo Errores (Errors)', value: 'error' },
          { name: 'Solo Advertencias (Warnings)', value: 'warn' }
        )
    )
    .addIntegerOption(opt =>
      opt.setName('cantidad')
        .setDescription('Cantidad de registros a consultar (1 – 25, por defecto 15)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(25)
    ),

  async execute(interaction, client) {
    if (!isOwnerOrDev(interaction.user.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Dueño y Desarrollador** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en tu archivo `.env` para obtener acceso.'
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const filter = interaction.options.getString('filtro') || 'all';
    const limit = interaction.options.getInteger('cantidad') || 15;

    const embed = await renderLogsEmbed(client, interaction.user, filter, limit);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!isOwnerOrDev(message.author.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Dueño y Desarrollador** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en tu archivo `.env` para obtener acceso.'
      );
      return message.reply({ embeds: [embed] });
    }

    let filter = 'all';
    let limit = 15;

    if (args[0]) {
      const arg0 = args[0].toLowerCase();
      if (['error', 'errors', 'err'].includes(arg0)) filter = 'error';
      else if (['warn', 'warning', 'warnings'].includes(arg0)) filter = 'warn';
      else if (!isNaN(parseInt(arg0, 10))) limit = parseInt(arg0, 10);
    }
    if (args[1] && !isNaN(parseInt(args[1], 10))) {
      limit = parseInt(args[1], 10);
    }

    limit = Math.max(1, Math.min(25, limit));

    const embed = await renderLogsEmbed(client, message.author, filter, limit);
    return message.reply({ embeds: [embed] });
  },

  renderLogsEmbed
};
