const { EmbedBuilder } = require('discord.js');
const { readProfiles, writeProfiles } = require('../utils/profileStore');
const { getFlameTier, getLocalDayInfo } = require('./streak/streakService');
const logger = require('../utils/logger');

let clientRef = null;
let intervalRef = null;

async function checkStreaks() {
  if (!clientRef) return;

  const { today, midnightTs, msRemaining } = getLocalDayInfo();
  const hoursUntilMidnight = msRemaining / 3600000;

  // Solo ejecuta si faltan 3 horas o menos para medianoche (y más de 0)
  if (hoursUntilMidnight > 3 || hoursUntilMidnight <= 0) return;

  const profiles = readProfiles();
  let modified = false;

  for (const guild of clientRef.guilds.cache.values()) {
    const guildUsers = profiles.users?.[guild.id];
    if (!guildUsers || typeof guildUsers !== 'object') continue;

    for (const [userId, profile] of Object.entries(guildUsers)) {
      const streak = Number(profile.streakDays) || 0;
      if (streak < 1) continue;

      const lastActive = Number(profile.lastActiveDay) || 0;
      if (lastActive === today) continue; // Ya envió mensaje hoy, racha a salvo

      const lastReminded = Number(profile.lastStreakReminderDay) || 0;
      if (lastReminded === today) continue; // Ya fue notificado hoy
      if (profile.streakAlertsDisabled) continue; // Usuario desactivó alertas voluntariamente

      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member || member.user.bot) continue;

        const tier = getFlameTier(streak);
        const minutesLeft = Math.floor(msRemaining / 60000);
        const hoursLeft = Math.floor(minutesLeft / 60);
        const minsLeft = minutesLeft % 60;
        const timeText = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft} minutos`;

        const embed = new EmbedBuilder()
          .setAuthor({ name: '🔥 ¡Tu Racha de Actividad está en Peligro!' })
          .setColor(0xFEE75C)
          .setDescription(`Llevas **${streak} día${streak !== 1 ? 's' : ''}** de racha activa en **${guild.name}** (${tier.emoji} **Nivel: ${tier.name}**).\n\nTodavía no has enviado ningún mensaje hoy en el servidor. Si no escribes antes de medianoche, perderás tu racha y tus bonificaciones de XP.`)
          .addFields(
            { name: '⏳ Tiempo Restante', value: `Te quedan **${timeText}** (Límite: <t:${midnightTs}:t> · <t:${midnightTs}:R>)`, inline: false },
            { name: '💬 ¿Cómo salvarla?', value: `> ¡Solo entra a **${guild.name}** y envía al menos un mensaje en cualquier canal de texto!`, inline: false }
          )
          .setFooter({ text: `${guild.name} · Sistema de Rachas de Actividad` })
          .setTimestamp();

        await member.user.send({ embeds: [embed] }).catch(() => {
          logger.warn('[streakReminder] No se pudo enviar DM de racha', { userId, guildId: guild.id });
        });

        profile.lastStreakReminderDay = today;
        modified = true;
      } catch (err) {
        logger.error('[streakReminder] Error procesando usuario:', { userId, error: err.message });
      }
    }
  }

  if (modified) {
    writeProfiles(profiles);
  }
}

function init(client) {
  clientRef = client;
  intervalRef = setInterval(checkStreaks, 20 * 60 * 1000); // Chequea cada 20 minutos
  setTimeout(checkStreaks, 5000);
  logger.info('Sistema de alerta de rachas por DM iniciado.');
}

function stop() {
  if (intervalRef) {
    clearInterval(intervalRef);
    intervalRef = null;
  }
}

module.exports = { init, stop, checkStreaks };
