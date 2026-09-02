/**
 * Utilidad centralizada de autenticación para Dueño (Owner) y Desarrollador (Developer).
 * Gestiona el acceso restringido a comandos exclusivos configurados en .env.
 */

function parseIds(envVar) {
  if (!envVar || typeof envVar !== 'string') return [];
  return envVar
    .split(/[,;\s]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

/**
 * Obtiene la lista de IDs de Dueños configurados en las variables de entorno.
 * @returns {string[]}
 */
function getOwnerIds() {
  const ids = [
    ...parseIds(process.env.OWNER_ID),
    ...parseIds(process.env.OWNER_IDS),
    ...parseIds(process.env.BOT_OWNER_ID)
  ];
  return Array.from(new Set(ids));
}

/**
 * Obtiene la lista de IDs de Desarrolladores configurados en las variables de entorno.
 * @returns {string[]}
 */
function getDeveloperIds() {
  const ids = [
    ...parseIds(process.env.DEVELOPER_ID),
    ...parseIds(process.env.DEV_ID),
    ...parseIds(process.env.DEVELOPER_IDS),
    ...parseIds(process.env.DEV_IDS)
  ];
  return Array.from(new Set(ids));
}

/**
 * Verifica si un ID de usuario corresponde al Dueño del bot.
 * @param {string} userId
 * @returns {boolean}
 */
function isOwner(userId) {
  if (!userId) return false;
  const ownerIds = getOwnerIds();
  return ownerIds.includes(String(userId));
}

/**
 * Verifica si un ID de usuario corresponde a un Desarrollador del bot.
 * @param {string} userId
 * @returns {boolean}
 */
function isDeveloper(userId) {
  if (!userId) return false;
  const devIds = getDeveloperIds();
  return devIds.includes(String(userId));
}

/**
 * Verifica si un ID de usuario tiene permisos de Dueño o Desarrollador.
 * @param {string} userId
 * @returns {boolean}
 */
function isOwnerOrDev(userId) {
  return isOwner(userId) || isDeveloper(userId);
}

/**
 * Devuelve el rol de staff del usuario como texto legible, o null si no está autorizado.
 * @param {string} userId
 * @returns {string|null}
 */
function getStaffRole(userId) {
  if (isOwner(userId)) return '👑 Dueño (Owner)';
  if (isDeveloper(userId)) return '💻 Desarrollador (Developer)';
  return null;
}

module.exports = {
  parseIds,
  getOwnerIds,
  getDeveloperIds,
  isOwner,
  isDeveloper,
  isOwnerOrDev,
  getStaffRole
};
