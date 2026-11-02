const { createEmbed } = require('../utils/ui');
const { } = require('discord.js');
const { readProfiles, migrateStreakPreferences } = require('../utils/profileStore');
const { getUserStreakStatus, markStreakReminderSent } = require('./streak/streakService');
const { canSendDmNotification, sendDmNotification } = require('./notification/dmNotificationService');
const logger = require('../utils/logger');
let clientRef = null, intervalRef = null, startupTimer = null, checking = false, generation = 0;

function eligible(status) {
  // Solo rachas activas (>= STREAK_ACTIVATION_DAYS) reciben recordatorio.
  return status.isActive && !status.streakDisabled && !status.isActiveToday &&
    !status.alreadyReminded && !status.alertsDisabled && status.msRemaining > 0 && status.msRemaining <= 3 * 3600000;
}
async function checkStreaks() {
  if (!clientRef || checking) return;
  checking = true;
  const run = generation, client = clientRef;
  try {
    const profiles = readProfiles();
    for (const guild of client.guilds.cache.values()) {
      for (const userId of Object.keys(profiles.users?.[guild.id] || {})) {
        if (!clientRef || generation !== run) return;
        const candidate = getUserStreakStatus(guild.id, userId, { profiles, includeInventory: false });
        if (!eligible(candidate) || !canSendDmNotification(guild.id, userId, 'streaks')) continue;
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (!member || member.user.bot || !clientRef || generation !== run) continue;
          // Recheck after API awaits; a message or timezone change may have saved the streak.
          const status = getUserStreakStatus(guild.id, userId, { includeInventory: false });
          if (!eligible(status)) continue;
          const minutes = Math.floor(status.msRemaining / 60000);
          const hours = Math.floor(minutes / 60);
          const timeText = hours ? hours + 'h ' + minutes % 60 + 'm' : minutes + ' minutos';
          const embed = createEmbed()
            .setAuthor({ name: '🔥 ¡Tu Racha de Actividad está en Peligro!' }).setColor(0xFEE75C)
            .setDescription('Llevas **' + status.streakDays + ' días** de racha en **' + guild.name +
              '**. Envía un mensaje antes de las **12:00 a. m.** en tu zona **' + status.timeZone + '** para mantenerla.')
            .addFields(
              { name: '⏳ Tiempo Restante', value: 'Te quedan **' + timeText + '** · <t:' + status.midnightTs + ':R>' },
              { name: '💬 ¿Cómo salvarla?', value: 'Envía al menos un mensaje en cualquier canal de texto del servidor.' })
            .setFooter({ text: guild.name + ' · Rachas de actividad' }).setTimestamp();
          const result = await sendDmNotification(member.user, { guildId: guild.id, guildName: guild.name, category: 'streaks', embeds: [embed] });
          if (result.sent && clientRef && generation === run) markStreakReminderSent(guild.id, userId, status.reminderKey);
        } catch (error) { logger.error('[streakReminder] Error procesando usuario', { userId, error: error.message }); }
      }
    }
  } catch (error) { logger.error('[streakReminder] Error en verificación', { error: error.message }); }
  finally { checking = false; }
}
function init(client) {
  stop();
  clientRef = client;
  // Antes de enviar cualquier recordatorio, validar qué usuarios ya tenían
  // una racha de 5 días o más para conservar (o no) su configuración previa.
  try {
    migrateStreakPreferences();
  } catch (err) {
    logger.error('[streakReminder] Error validando preferencias de racha:', { error: err.message });
  }
  intervalRef = setInterval(checkStreaks, 20 * 60 * 1000);
  startupTimer = setTimeout(checkStreaks, 5000);
  logger.info('Recordatorios de rachas por zona horaria iniciados.');
}
function stop() {
  generation++;
  if (intervalRef) clearInterval(intervalRef);
  if (startupTimer) clearTimeout(startupTimer);
  intervalRef = null; startupTimer = null; clientRef = null;
}
module.exports = { init, stop, checkStreaks };
