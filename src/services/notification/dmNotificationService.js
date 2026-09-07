const logger = require('../../utils/logger');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const VALID_CATEGORIES = ['all', 'streaks', 'warns', 'levels', 'boosts', 'badges'];

const CATEGORY_METADATA = {
  all: {
    key: 'all',
    label: 'Todas las notificaciones',
    emoji: '📬',
    description: 'Interruptor general para cualquier mensaje directo del servidor'
  },
  streaks: {
    key: 'streaks',
    label: 'Rachas y Recordatorios',
    emoji: '🔥',
    description: 'Avisos de riesgo de perder racha, rachas congeladas, reactivadas e hitos diarios'
  },
  warns: {
    key: 'warns',
    label: 'Advertencias de Moderación',
    emoji: '⚠️',
    description: 'Avisos automáticos cuando un moderador aplica una sanción o advertencia'
  },
  levels: {
    key: 'levels',
    label: 'Subidas de Nivel',
    emoji: '⭐',
    description: 'Notificaciones de subida de nivel cuando el canal de anuncios es DM o inaccesible'
  },
  boosts: {
    key: 'boosts',
    label: 'Beneficios de Booster',
    emoji: '💎',
    description: 'Recompensas de monedas, avisos de perfil guardado/restaurado y medallas de boost'
  },
  badges: {
    key: 'badges',
    label: 'Logros y Medallas',
    emoji: '🎖️',
    description: 'Alertas cuando desbloqueas un nuevo logro o insignia por actividad'
  }
};

/**
 * Obtiene las preferencias actuales de notificación por DM de un usuario en un servidor
 * @param {string} guildId
 * @param {string} userId
 * @returns {Record<string, boolean>}
 */
function getNotificationPreferences(guildId, userId) {
  if (!guildId || !userId) {
    return { all: true, streaks: true, warns: true, levels: true, boosts: true, badges: true };
  }

  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);

  const notifs = u.dmNotifications || {};
  const streaksDefault = u.streakAlertsDisabled ? false : true;

  return {
    all: typeof notifs.all === 'boolean' ? notifs.all : true,
    streaks: typeof notifs.streaks === 'boolean' ? notifs.streaks : streaksDefault,
    warns: typeof notifs.warns === 'boolean' ? notifs.warns : true,
    levels: typeof notifs.levels === 'boolean' ? notifs.levels : true,
    boosts: typeof notifs.boosts === 'boolean' ? notifs.boosts : true,
    badges: typeof notifs.badges === 'boolean' ? notifs.badges : true
  };
}

/**
 * Configura la preferencia de una categoría de notificación para un usuario
 * @param {string} guildId
 * @param {string} userId
 * @param {string} category 'all' | 'streaks' | 'warns' | 'levels' | 'boosts' | 'badges'
 * @param {boolean} enabled
 * @returns {Record<string, boolean>} Preferencias actualizadas
 */
function setNotificationPreference(guildId, userId, category, enabled) {
  if (!guildId || !userId) return getNotificationPreferences(guildId, userId);

  const normalizedCategory = String(category || '').toLowerCase().trim();
  if (!VALID_CATEGORIES.includes(normalizedCategory)) {
    throw new Error(`Categoría inválida: ${category}. Válidas: ${VALID_CATEGORIES.join(', ')}`);
  }

  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);

  if (!u.dmNotifications) {
    u.dmNotifications = {
      all: true,
      streaks: u.streakAlertsDisabled ? false : true,
      warns: true,
      levels: true,
      boosts: true,
      badges: true
    };
  }

  const state = Boolean(enabled);

  if (normalizedCategory === 'all') {
    u.dmNotifications.all = state;
    // Si se activa o desactiva "all", reflejarlo en todas las subcategorías
    for (const cat of VALID_CATEGORIES) {
      u.dmNotifications[cat] = state;
    }
    u.streakAlertsDisabled = !state;
  } else {
    u.dmNotifications[normalizedCategory] = state;

    // Si se activa una categoría específica y 'all' estaba en false, rehabilitar 'all'
    if (state && u.dmNotifications.all === false) {
      u.dmNotifications.all = true;
    }

    if (normalizedCategory === 'streaks') {
      u.streakAlertsDisabled = !state;
    }
  }

  writeProfiles(profiles);
  logger.info('[dmNotificationService] Preferencia actualizada', { guildId, userId, category: normalizedCategory, state });

  return getNotificationPreferences(guildId, userId);
}

/**
 * Comprueba si el bot tiene permitido enviar un DM de una categoría a un usuario
 * @param {string} guildId
 * @param {string} userId
 * @param {string} category
 * @returns {boolean}
 */
function canSendDmNotification(guildId, userId, category = 'all') {
  if (!userId) return false;
  const prefs = getNotificationPreferences(guildId, userId);

  // Si el interruptor maestro está apagado
  if (prefs.all === false) return false;

  // Si la categoría específica está apagada
  if (category && prefs[category] === false) return false;

  return true;
}

/**
 * Envía un mensaje directo a un usuario respetando sus preferencias y gestionando bloqueos de DM
 * @param {import('discord.js').User | import('discord.js').GuildMember} targetUserOrMember
 * @param {object} options
 * @param {string} options.guildId
 * @param {string} [options.guildName]
 * @param {string} [options.category]
 * @param {string} [options.content]
 * @param {any[]} [options.embeds]
 * @param {any[]} [options.components]
 * @returns {Promise<{ ok: boolean, sent: boolean, reason?: string, error?: string }>}
 */
async function sendDmNotification(targetUserOrMember, options = {}) {
  if (!targetUserOrMember) {
    return { ok: false, sent: false, reason: 'no_target' };
  }

  const user = targetUserOrMember.user || targetUserOrMember;
  if (!user || user.bot) {
    return { ok: true, sent: false, reason: 'bot_target' };
  }

  const guildId = options.guildId || targetUserOrMember.guild?.id;
  const category = options.category || 'all';

  // Verificar si el usuario ha desactivado este tipo de notificaciones
  if (!canSendDmNotification(guildId, user.id, category)) {
    logger.debug('[dmNotificationService] DM omitido: usuario desactivó notificaciones', {
      userId: user.id,
      guildId,
      category
    });
    return { ok: true, sent: false, reason: 'opted_out' };
  }

  const payload = {};
  if (options.content) payload.content = options.content;
  if (options.embeds) payload.embeds = options.embeds;
  if (options.components) payload.components = options.components;

  try {
    const sentMessage = await user.send(payload);
    return { ok: true, sent: true, messageId: sentMessage?.id };
  } catch (err) {
    // Discord API Error 50007: Cannot send messages to this user (DMs closed or bot blocked)
    if (err.code === 50007 || err?.message?.includes('Cannot send messages to this user')) {
      logger.info('[dmNotificationService] No se pudo enviar DM: usuario tiene DMs cerrados o bloqueó al bot', {
        userId: user.id,
        guildId,
        category
      });
      return { ok: true, sent: false, reason: 'dms_closed' };
    }

    logger.warn('[dmNotificationService] Error inesperado enviando DM:', {
      userId: user.id,
      guildId,
      category,
      error: err.message
    });
    return { ok: false, sent: false, reason: 'send_error', error: err.message };
  }
}

module.exports = {
  VALID_CATEGORIES,
  CATEGORY_METADATA,
  getNotificationPreferences,
  setNotificationPreference,
  canSendDmNotification,
  sendDmNotification
};
