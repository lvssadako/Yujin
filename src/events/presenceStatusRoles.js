const logger = require('../utils/logger');
const { Events, ActivityType } = require('discord.js');
const { readConfig } = require('../utils/configCache');
const { validateRoleForAssignment } = require('../utils/roleValidation');

const userCooldown = new Map();
const COOLDOWN_MS = 5000;
const pendingRemove = new Map();
const REMOVE_DELAY_MS = 10000; // 10 segundos

function text(v) {
  return String(v ?? '').trim();
}

module.exports = (client) => {
  client.on(Events.PresenceUpdate, async (_old, pres) => {
    try {
      if (!pres?.member || !pres.guild) return;

      // ✅ FIX: Si está offline/invisible, no hacer nada (mantener roles)
      const status = pres.status;
      if (status === 'offline' || status === 'invisible') return;

      const now = Date.now();
      const last = userCooldown.get(pres.member.id) || 0;
      if (now - last < COOLDOWN_MS) return;
      userCooldown.set(pres.member.id, now);

      const cfg = readConfig();
      const triggers = Array.isArray(cfg.statusRoleTriggers) ? cfg.statusRoleTriggers : [];
      if (!triggers.length) return;

      const member = pres.member;

      const custom = pres.activities.find(a => a.type === ActivityType.Custom);
      const customStatus = text(custom?.state).toLowerCase();

      for (const t of triggers) {
        if (!t.roleId || t.field !== 'status') continue;

        const searchText = text(t.includes).toLowerCase();
        if (!searchText) continue;

        const validation = validateRoleForAssignment(pres.guild, t.roleId, 'presence status role');
        if (!validation.valid) {
          logger.warn(`[presenceStatusRoles] Invalid role ${t.roleId}: ${validation.reason}`);
          continue;
        }

        const hasText = customStatus.includes(searchText);

        if (hasText) {
          // Si el usuario recupera el texto, cancelamos cualquier timer de quitar rol
          if (pendingRemove.has(member.id + t.roleId)) {
            clearTimeout(pendingRemove.get(member.id + t.roleId));
            pendingRemove.delete(member.id + t.roleId);
          }
          if (!member.roles.cache.has(t.roleId)) {
            await member.roles.add(t.roleId).catch((e) => {
              logger.warn(`[presenceStatusRoles] Failed to add role ${t.roleId}:`, e?.message);
            });
          }
        } else {
          // Solo remueve el rol si el estado personalizado no contiene la frase, sin importar el status online/offline/invisible
          if (member.roles.cache.has(t.roleId) && !pendingRemove.has(member.id + t.roleId)) {
            const timeout = setTimeout(async () => {
              // Volvemos a leer el estado personalizado antes de quitar el rol
              const refreshed = member.presence?.activities?.find(a => a.type === ActivityType.Custom);
              const refreshedStatus = text(refreshed?.state).toLowerCase();
              if (!refreshedStatus.includes(searchText)) {
                await member.roles.remove(t.roleId).catch((e) => {
                  logger.warn(`[presenceStatusRoles] Failed to remove role ${t.roleId}:`, e?.message);
                });
              }
              pendingRemove.delete(member.id + t.roleId);
            }, REMOVE_DELAY_MS);
            pendingRemove.set(member.id + t.roleId, timeout);
          }
        }
      }
    } catch (e) {
      logger.warn('[presenceStatusRoles]', e?.message || e);
    }
  });
};