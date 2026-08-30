const { EmbedBuilder } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
const { readConfig } = require('../utils/configCache');
const logger = require('../utils/logger');

let clientRef = null;
let intervalRef = null;

function streakEmoji(streak) {
  if (streak >= 30) return '🌟';
  if (streak >= 14) return '💎';
  if (streak >= 7) return '🔥';
  if (streak >= 3) return '⚡';
  return '✨';
}

async function checkStreaks() {
  if (!clientRef) return;

  const cfg = readConfig();
  const tz = cfg.timezone || 0;

  const now = Date.now();
  const today = Math.floor((now + tz * 3600000) / 86400000);
  const midnightLocal = (today + 1) * 86400000 - tz * 3600000;
  const hoursUntilMidnight = (midnightLocal - now) / 3600000;

  if (hoursUntilMidnight > 3 || hoursUntilMidnight < 0) return;

  const profiles = readProfiles();
  let modified = false;

  for (const guild of clientRef.guilds.cache.values()) {
    const guildProfiles = Object.entries(profiles).filter(([uid, p]) => {
      if (!p || typeof p !== 'object') return false;
      const streak = p.dailyStreak || 0;
      if (streak < 1) return false;
      const lastDay = p.lastDailyDay || 0;
      if (lastDay === today) return false;
      if (p.lastStreakReminderDay === today) return false;
      return true;
    });

    for (const [userId, profile] of guildProfiles) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) continue;

        const streak = profile.dailyStreak || 0;
        const sEmoji = streakEmoji(streak);
        const minutesLeft = Math.floor((midnightLocal - now) / 60000);
        const hoursLeft = Math.floor(minutesLeft / 60);
        const minsLeft = minutesLeft % 60;
        const timeText = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft} minutos`;

        const embed = new EmbedBuilder()
          .setAuthor({ name: '⚠️ ¡Tu racha está en peligro!' })
          .setColor(0xFEE75C)
          .setDescription(`${sEmoji} Llevas **${streak} día${streak !== 1 ? 's' : ''}** de racha en **${guild.name}** y aún no has reclamado tu daily de hoy.`)
          .addFields(
            { name: '⏳ Tiempo Restante', value: `Te quedan **${timeText}** antes de perder tu racha.`, inline: false },
            { name: '💡 ¿Qué hacer?', value: '> Usa `/daily` en el servidor para reclamar tu recompensa y mantener tu racha.', inline: false }
          )
          .setFooter({ text: `Servidor: ${guild.name} · No pierdas tu progreso` })
          .setTimestamp();

        await member.user.send({ embeds: [embed] }).catch(() => {
          logger.warn('No se pudo enviar DM de racha', { userId, guild: guild.id });
        });

        profile.lastStreakReminderDay = today;
        modified = true;

      } catch (err) {
        logger.error('Error en streak reminder', { userId, error: err.message });
      }
    }
  }

  if (modified) {
    writeProfiles(profiles);
  }
}

function init(client) {
  clientRef = client;
  intervalRef = setInterval(checkStreaks, 30 * 60 * 1000);
  setTimeout(checkStreaks, 10000);
  logger.info('Sistema de recordatorio de rachas iniciado.');
}

function stop() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
}

module.exports = { init, stop, checkStreaks };
