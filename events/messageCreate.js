const { addCoins } = require('../utils/economy');
const { addXp } = require('../utils/levelStore');
const { shouldSendAutoMessage } = require('../utils/autoMessageGuard');
const { grantOnceAsync } = require('../utils/eventGuard');

const fs = require('fs');
const path = require('path');
const { addTimer, removeTimer, hasActiveTimerForGuild } = require('../utils/bumpTimers');

const DISBOARD_ID = '302050872383242240';
const BUMP_SUCCESS_TEXT = 'Bump done!';
const processedBumps = new Map();

// Configuración de recordatorio (canal y rol)
const configPath = path.join(__dirname, '..', 'data', 'bump_reminder.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return {}; }
}

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Solo mensajes del bot Disboard
if (
  message.author.id !== DISBOARD_ID ||
  !message.guild
) return;

const hasBumpEmbed = message.embeds.some(embed =>
  embed.description && embed.description.includes(BUMP_SUCCESS_TEXT)
);

if (!hasBumpEmbed) return;


    // Detectar usuario del bump usando el campo interaction del mensaje de Disboard
    let userId = null;
    if (message.interaction && message.interaction.user) {
      userId = message.interaction.user.id;
    } else if (message.interaction && message.interaction.userId) {
      userId = message.interaction.userId;
    }

    // Si no se pudo detectar, fallback al método anterior (opcional)
    if (!userId) {
      const fetched = await message.channel.messages.fetch({ limit: 20 });
      const bumpMsg = fetched
        .filter(m =>
          m.author.id !== DISBOARD_ID &&
          m.type === 20 && // 20 = APPLICATION_COMMAND
          m.interaction &&
          m.interaction.commandName === 'bump' &&
          m.createdTimestamp < message.createdTimestamp
        )
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .first();
      if (bumpMsg) userId = bumpMsg.author.id;
    }

    if (!userId) return; // No se encontró quién hizo el bump
    const guildId = message.guild.id;
    const bumpKey = `${guildId}:${userId}`;
    const now = Date.now();
    const lastProcessed = processedBumps.get(bumpKey) || 0;

    if (now - lastProcessed < 90 * 1000) {
      return;
    }
    if (!shouldSendAutoMessage('bump', bumpKey, 90 * 1000)) {
      return;
    }
    processedBumps.set(bumpKey, now);
    setTimeout(() => {
      if (processedBumps.get(bumpKey) === now) processedBumps.delete(bumpKey);
    }, 2 * 60 * 60 * 1000);

    const rewarded = await grantOnceAsync(guildId, userId, 'bump_reward', 'disboard', 90 * 1000, async () => {
      addCoins(guildId, userId, 1000);
      addXp(guildId, userId, 500);
      return true;
    });

    if (!rewarded) {
      return;
    }

    // Mensaje de agradecimiento
    try {
      await message.channel.send({
        content: `¡Gracias <@${userId}> por hacer bump! Has recibido **1000 monedas** y **500 XP**.`
      });
    } catch {}

    // Recordatorio (si está configurado)
    const config = readConfig();
    const reminder = config[guildId];
    if (reminder && reminder.channelId && reminder.roleId) {
      if (hasActiveTimerForGuild(guildId)) {
        return;
      }

      const timerId = `${guildId}_${Date.now()}`;
      const sendAt = Date.now() + 2 * 60 * 60 * 1000;
      addTimer({
        id: timerId,
        guildId,
        channelId: reminder.channelId,
        roleId: reminder.roleId,
        userId,
        sendAt
      });
      setTimeout(async () => {
        const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
        if (channel) {
          channel.send({
            content: `<@&${reminder.roleId}> ¡Es hora de hacer /bump de nuevo! Usa /bump para apoyar el servidor.`
          });
        }
        removeTimer(timerId);
      }, 2 * 60 * 60 * 1000);
    }
  });
};