const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  FLAME_TIERS,
  getUserStreakStatus,
  setStreakAlertPreference,
  getStreakLeaderboard
} = require('../../services/streak/streakService');
const { generateStreakCard } = require('../../services/streak/streakCard');

function buildLeaderboardEmbed(guild, lb) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = lb.top.map((u, i) => {
    const medal = medals[i] || `**#${i + 1}**`;
    const statusIcon = u.isActiveToday ? '🟢' : '⏳';
    return `${medal} <@${u.userId}> — ${u.tier.emoji} **${u.streakDays} días** (${u.tier.name}) ${statusIcon}`;
  });

  return new EmbedBuilder()
    .setAuthor({ name: `🏆 Tabla de Rachas — ${guild.name}`, iconURL: guild.iconURL({ dynamic: true }) })
    .setColor(0xF1C40F)
    .setDescription(
      lines.length > 0
        ? lines.join('\n\n')
        : '*No hay rachas activas en este momento. ¡Sé el primero en chatear!*'
    )
    .addFields({
      name: '📈 Estadísticas del Servidor',
      value: `> 👥 **Usuarios con racha activa:** ${lb.totalActive}\n> 🔥 **Mayor racha actual:** ${lb.highestStreak} días\n> 🟢 = *Ya escribió hoy* · ⏳ = *Pendiente de escribir hoy*`,
      inline: false
    })
    .setFooter({ text: 'Escribe todos los días en el servidor para escalar el ranking' })
    .setTimestamp();
}

function buildTiersEmbed() {
  const lines = FLAME_TIERS.map(t => {
    const bonusXp = Math.round((t.xpMultiplier - 1) * 100);
    const perks = [];
    if (bonusXp > 0) perks.push(`+${bonusXp}% XP Extra`);
    if (t.shopDiscount > 0) perks.push(`${t.shopDiscount}% Descuento Tienda`);
    if (t.rewardCoins > 0) perks.push(`🎁 Recompensa: ${t.rewardCoins.toLocaleString()} 🪙`);
    if (t.badge) perks.push(`Insignia: ${t.badge}`);
    const perksText = perks.length > 0 ? perks.join(' · ') : 'Reconocimiento inicial';

    return `${t.emoji} **${t.name}** (Desde ${t.minDays} días)\n> ╰ *${perksText}*`;
  });

  return new EmbedBuilder()
    .setAuthor({ name: '🔥 Niveles de Fuego y Recompensas de Racha' })
    .setColor(0xE67E22)
    .setDescription(
      'Tu racha aumenta automáticamente cada día que **envías al menos un mensaje** en el servidor.\n\n' +
      lines.join('\n\n')
    )
    .addFields({
      name: '🧊 ¿Cómo proteger tu racha?',
      value: '> Compra un **🧊 Congelador de Racha** en `/buy` por 3,500 🪙 para salvar tu racha automáticamente si olvidas chatear un día.',
      inline: false
    })
    .setFooter({ text: 'El contador se reinicia a medianoche si no envías ningún mensaje.' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Sistema de Rachas de Actividad por Chat.')
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

  async execute(interaction) {
    const sub = interaction.options.getSubcommand() || 'ver';
    const guild = interaction.guild;

    if (sub === 'ver') {
      await interaction.deferReply();
      const target = interaction.options.getUser('usuario') || interaction.user;
      const status = getUserStreakStatus(guild.id, target.id);
      const botName = interaction.guild?.members?.me?.displayName || interaction.client?.user?.username || 'Bot';
      const attachment = await generateStreakCard(target, status, botName);
      return interaction.editReply({ files: [attachment] });
    }

    if (sub === 'top') {
      const lb = getStreakLeaderboard(guild.id, 10);
      const embed = buildLeaderboardEmbed(guild, lb);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'niveles') {
      const embed = buildTiersEmbed();
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'alertas') {
      const estado = interaction.options.getString('estado');
      const disabled = estado === 'off';
      setStreakAlertPreference(guild.id, interaction.user.id, disabled);
      return interaction.reply({
        content: disabled
          ? '🔕 **Alertas desactivadas.** Ya no recibirás DMs de recordatorio de racha.'
          : '🔔 **Alertas activadas.** Te avisaremos por DM 3 horas antes de medianoche si estás por perder tu racha.',
        ephemeral: true
      });
    }
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('❌ Este comando solo puede usarse en servidores.');

    const sub = (args[0] || '').toLowerCase();
    const guild = message.guild;

    if (sub === 'top' || sub === 'leaderboard') {
      const lb = getStreakLeaderboard(guild.id, 10);
      const embed = buildLeaderboardEmbed(guild, lb);
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'niveles' || sub === 'tiers' || sub === 'info') {
      const embed = buildTiersEmbed();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'alertas' || sub === 'alerts') {
      const option = (args[1] || '').toLowerCase();
      const disabled = ['off', 'desactivar', 'no'].includes(option);
      setStreakAlertPreference(guild.id, message.author.id, disabled);
      return message.reply(
        disabled
          ? '🔕 **Alertas desactivadas.** Ya no recibirás DMs de recordatorio de racha.'
          : '🔔 **Alertas activadas.** Te avisaremos por DM si estás por perder tu racha.'
      );
    }

    // Default: Generar tarjeta visual
    let target = message.author;
    if (message.mentions.users.size > 0) {
      target = message.mentions.users.first();
    } else if (args[0] && !['ver', 'me', 'card'].includes(sub)) {
      const parsedId = args[0].replace(/[<@!>]/g, '');
      const fetched = await guild.members.fetch(parsedId).catch(() => null);
      if (fetched) target = fetched.user;
    }

    const status = getUserStreakStatus(guild.id, target.id);
    const botName = message.guild?.members?.me?.displayName || message.client?.user?.username || 'Bot';
    const attachment = await generateStreakCard(target, status, botName);
    return message.reply({ files: [attachment] });
  },

  buildLeaderboardEmbed,
  buildTiersEmbed
};
