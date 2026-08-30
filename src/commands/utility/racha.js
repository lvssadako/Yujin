const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  FLAME_TIERS,
  getUserStreakStatus,
  getStreakLeaderboard
} = require('../../services/streak/streakService');

function buildProgressBar(percent, length = 10) {
  const filled = Math.min(length, Math.max(0, Math.round((percent / 100) * length)));
  return `[${'🟧'.repeat(filled)}${'⬛'.repeat(length - filled)}] ${percent}%`;
}

function buildStreakPassportEmbed(guild, targetUser, status) {
  const { streakDays, isActiveToday, currentTier, nextTier, progressPercent, daysToNext, midnightTs } = status;

  const statusIndicator = isActiveToday
    ? '🟢 **Protegida hoy** — Ya enviaste mensajes hoy. ¡Racha segura!'
    : `🟠 **En riesgo hoy** — Debes escribir antes de medianoche (<t:${midnightTs}:R>)`;

  const bonusXp = Math.round((currentTier.xpMultiplier - 1) * 100);
  const bonusText = bonusXp > 0 ? `+${bonusXp}% XP extra en mensajes` : 'Sin bonus activo (¡Llega a 3 días!)';
  const shopText = currentTier.shopDiscount > 0 ? `${currentTier.shopDiscount}% de descuento en la tienda` : 'Sin descuento';

  const nextTierText = nextTier
    ? `${nextTier.emoji} **${nextTier.name}** (a los ${nextTier.minDays} días)\n> ${buildProgressBar(progressPercent)}\n> *Faltan **${daysToNext} día${daysToNext === 1 ? '' : 's'}** consecutivos de chat.*`
    : '👑 **¡Nivel Máximo Alcanzado!** Eres una leyenda de la comunidad.';

  return new EmbedBuilder()
    .setAuthor({ name: `🔥 Pasaporte de Racha: ${targetUser.username}`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
    .setColor(currentTier.color || 0xFF6B6B)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 512 }))
    .addFields(
      {
        name: '📊 Racha de Actividad',
        value: `${currentTier.emoji} **${streakDays} Día${streakDays === 1 ? '' : 's'} Consecutivos**\n> **Nivel:** ${currentTier.name}\n> **Estado:** ${statusIndicator}`,
        inline: false
      },
      {
        name: '⚡ Beneficios Activos',
        value: `✨ **Multiplicador de XP:** ${bonusText}\n🛒 **Descuento en Tienda:** ${shopText}`,
        inline: false
      },
      {
        name: '🎯 Siguiente Nivel de Fuego',
        value: nextTierText,
        inline: false
      }
    )
    .setFooter({ text: `Servidor: ${guild.name} · Envía mensajes a diario para mantener tu fuego` })
    .setTimestamp();
}

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
      name: '📈 Estadísticas Globales',
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
    if (bonusXp > 0) perks.push(`+${bonusXp}% XP`);
    if (t.shopDiscount > 0) perks.push(`${t.shopDiscount}% Tienda`);
    if (t.badge) perks.push(`Insignia: ${t.badge}`);
    const perksText = perks.length > 0 ? perks.join(' · ') : 'Reconocimiento inicial';

    return `${t.emoji} **${t.name}** (Desde ${t.minDays} días)\n> ╰ 🎁 *${perksText}*`;
  });

  return new EmbedBuilder()
    .setAuthor({ name: '🔥 Niveles de Fuego y Beneficios de Racha' })
    .setColor(0xE67E22)
    .setDescription(
      'Tu racha aumenta automáticamente cada día que **envías al menos un mensaje** en el servidor.\n\n' +
      lines.join('\n\n')
    )
    .setFooter({ text: 'El contador se reinicia a medianoche si no envías ningún mensaje.' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('racha')
    .setDescription('Sistema de Rachas de Actividad por Chat.')
    .addSubcommand(sub =>
      sub.setName('ver')
        .setDescription('Consulta tu racha actual o la de otro usuario')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a consultar').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('top')
        .setDescription('Muestra el Top 10 de usuarios con mayor racha del servidor')
    )
    .addSubcommand(sub =>
      sub.setName('niveles')
        .setDescription('Muestra los niveles de fuego y recompensas desbloqueables')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand() || 'ver';
    const guild = interaction.guild;

    if (sub === 'ver') {
      const target = interaction.options.getUser('usuario') || interaction.user;
      const status = getUserStreakStatus(guild.id, target.id);
      const embed = buildStreakPassportEmbed(guild, target, status);
      return interaction.reply({ embeds: [embed] });
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

    // Default: ver racha de uno mismo o del usuario mencionado
    let target = message.author;
    if (message.mentions.users.size > 0) {
      target = message.mentions.users.first();
    } else if (args[0] && !['ver', 'me'].includes(sub)) {
      const parsedId = args[0].replace(/[<@!>]/g, '');
      const fetched = await guild.members.fetch(parsedId).catch(() => null);
      if (fetched) target = fetched.user;
    }

    const status = getUserStreakStatus(guild.id, target.id);
    const embed = buildStreakPassportEmbed(guild, target, status);
    return message.reply({ embeds: [embed] });
  },

  buildStreakPassportEmbed,
  buildLeaderboardEmbed,
  buildTiersEmbed
};
