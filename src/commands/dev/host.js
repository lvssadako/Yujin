const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isOwnerOrDev, getStaffRole } = require('../../utils/staffAuth');
const { getHostMetrics, formatBytes, formatDuration, makeProgressBar } = require('../../utils/hostMonitor');
const { createErrorEmbed } = require('../../utils/embedFactory');

async function renderHostEmbed(client, user) {
  const metrics = getHostMetrics(client);
  const staffRole = getStaffRole(user.id);

  const ramBar = makeProgressBar(metrics.memory.percent, 10);
  const diskBar = metrics.disk ? makeProgressBar(metrics.disk.percent, 10) : '`N/A`';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({
      name: `🖥️ Monitoreo de Recursos — VM Anfitriona (${metrics.os.platform === 'linux' ? 'Ubuntu / Linux' : metrics.os.platform})`,
      iconURL: client.user.displayAvatarURL()
    })
    .setDescription(
      `> 👤 **Autenticado:** ${staffRole} (<@${user.id}>)\n` +
      `> 🏠 **Host:** \`${metrics.os.hostname}\` · **OS:** \`${metrics.os.type} ${metrics.os.release} (${metrics.os.arch})\``
    )
    .addFields(
      {
        name: '🧠 Memoria RAM (Host)',
        value:
          `> ${ramBar}\n` +
          `> • **Usada:** \`${formatBytes(metrics.memory.used)}\` / \`${formatBytes(metrics.memory.total)}\`\n` +
          `> • **Libre:** \`${formatBytes(metrics.memory.free)}\``,
        inline: true
      },
      {
        name: '💽 Almacenamiento en Disco',
        value: metrics.disk
          ? `> ${diskBar}\n` +
            `> • **Usado:** \`${formatBytes(metrics.disk.used)}\` / \`${formatBytes(metrics.disk.total)}\`\n` +
            `> • **Libre:** \`${formatBytes(metrics.disk.free)}\``
          : '> *Información de disco no disponible.*',
        inline: true
      },
      {
        name: '⚡ Procesador (CPU)',
        value:
          `> • **Modelo:** \`${metrics.cpu.model.slice(0, 32)}\`\n` +
          `> • **Núcleos:** \`${metrics.cpu.cores}\` (${metrics.cpu.speedMHz} MHz)\n` +
          `> • **Load Avg:** \`${metrics.cpu.load1m}\` (1m) · \`${metrics.cpu.load5m}\` (5m) · \`${metrics.cpu.load15m}\` (15m)`,
        inline: false
      },
      {
        name: '🤖 Proceso Bot (Node.js)',
        value:
          `> • **Memoria RSS:** \`${formatBytes(metrics.memory.processRss)}\`\n` +
          `> • **Heap Usado:** \`${formatBytes(metrics.memory.heapUsed)}\` / \`${formatBytes(metrics.memory.heapTotal)}\`\n` +
          `> • **Node.js:** \`${process.version}\` (PID: \`${process.pid}\`)`,
        inline: true
      },
      {
        name: '⏱️ Tiempos de Actividad (Uptime)',
        value:
          `> • **Uptime VM:** \`${formatDuration(metrics.uptime.host)}\`\n` +
          `> • **Uptime Bot:** \`${formatDuration(metrics.uptime.bot)}\`\n` +
          `> • **Ping Discord:** \`${metrics.network.wsPing}ms\``,
        inline: true
      }
    )
    .setFooter({ text: 'Monitoreo de infraestructura en tiempo real' })
    .setTimestamp();

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('host')
    .setDescription('Muestra el monitoreo en tiempo real de recursos de la máquina / VM donde se aloja el bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    if (!isOwnerOrDev(interaction.user.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Dueño y Desarrollador** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en tu archivo `.env` para obtener acceso.'
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const embed = await renderHostEmbed(client, interaction.user);
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

    const embed = await renderHostEmbed(client, message.author);
    return message.reply({ embeds: [embed] });
  },

  renderHostEmbed
};
