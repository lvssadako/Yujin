const logger = require('../utils/logger');
const { Events, ActivityType } = require('discord.js');
const { readConfig } = require('../utils/configCache');
const { validateRoleForAssignment } = require('../utils/roleValidation');

const userCooldown = new Map();
const COOLDOWN_MS = 5000;
const pendingRemove = new Map();
const REMOVE_DELAY_MS = 10000; // 10 segundos de gracia

function text(v) {
  return String(v ?? '').trim();
}

function checkAndSetCooldown(userId) {
  const now = Date.now();
  const last = userCooldown.get(userId) || 0;
  if (now - last < COOLDOWN_MS) return false;
  userCooldown.set(userId, now);

  // Limpieza automática de entradas antiguas si el mapa supera 500 elementos
  if (userCooldown.size > 500) {
    for (const [id, timestamp] of userCooldown.entries()) {
      if (now - timestamp > COOLDOWN_MS * 2) {
        userCooldown.delete(id);
      }
    }
  }
  return true;
}

function resolveMemberTriggers(cfg) {
  let triggers = Array.isArray(cfg?.statusRoleTriggers) ? cfg.statusRoleTriggers : [];
  if (!triggers.length && cfg?.statusRoleId) {
    triggers = [
      {
        field: 'status',
        includes: '.gg/lco',
        roleId: cfg.statusRoleId
      }
    ];
  }
  return triggers.filter(t => 
    t && 
    typeof t === 'object' && 
    t.field === 'status' && 
    typeof t.roleId === 'string' && 
    t.roleId.trim() && 
    typeof t.includes === 'string' && 
    t.includes.trim()
  );
}

async function handlePresenceUpdate(_old, pres) {
  try {
    if (!pres || !pres.guild) return;

    // Si está offline o invisible, no hacer nada para mantener los roles del usuario
    const status = pres.status;
    if (status === 'offline' || status === 'invisible') return;

    const userId = pres.userId || pres.member?.id;
    if (!userId) return;

    // Throttle / Cooldown por usuario
    if (!checkAndSetCooldown(userId)) return;

    // Resolver miembro de forma segura (con fetch fallback si no está en cache)
    let member = pres.member;
    if (!member && pres.guild.members) {
      member = pres.guild.members.cache.get(userId) || await pres.guild.members.fetch(userId).catch(() => null);
    }
    if (!member || member.user?.bot) return;

    const cfg = readConfig();
    const triggers = resolveMemberTriggers(cfg);
    if (!triggers.length) return;

    const custom = pres.activities?.find?.(a => a.type === ActivityType.Custom || a.type === 4);
    const customStatus = text(custom?.state || custom?.details).toLowerCase();

    for (const t of triggers) {
      const searchText = text(t.includes).toLowerCase();
      if (!searchText) continue;

      const validation = validateRoleForAssignment(pres.guild, t.roleId, 'presence status role');
      if (!validation.valid) {
        logger.warn(`[presenceStatusRoles] Invalid role ${t.roleId}: ${validation.reason}`);
        continue;
      }

      const hasText = customStatus.includes(searchText);
      const removeKey = `${member.id}:${t.roleId}`;

      if (hasText) {
        // Cancelar remoción pendiente si el usuario recuperó el texto
        if (pendingRemove.has(removeKey)) {
          clearTimeout(pendingRemove.get(removeKey));
          pendingRemove.delete(removeKey);
        }
        if (!member.roles.cache.has(t.roleId)) {
          try {
            await member.roles.add(t.roleId);
            logger.info(`[presenceStatusRoles] Rol ${t.roleId} otorgado a ${member.user?.tag || member.id}`, {
              userId: member.id,
              roleId: t.roleId,
              guildId: pres.guild.id
            });
          } catch (err) {
            logger.warn(`[presenceStatusRoles] Error al añadir rol ${t.roleId} a ${member.id}:`, err?.message);
          }
        }
      } else {
        // Si no tiene el texto y tiene el rol, programar remoción con tiempo de gracia
        if (member.roles.cache.has(t.roleId) && !pendingRemove.has(removeKey)) {
          const timeout = setTimeout(async () => {
            try {
              pendingRemove.delete(removeKey);

              let freshMember = pres.guild.members.cache.get(member.id);
              if (!freshMember && pres.guild.members) {
                freshMember = await pres.guild.members.fetch(member.id).catch(() => null);
              }
              if (!freshMember) return;

              // Si el usuario pasó a offline o invisible durante el tiempo de gracia, NO quitar el rol
              const currentPres = freshMember.presence;
              if (!currentPres || currentPres.status === 'offline' || currentPres.status === 'invisible') {
                return;
              }

              const refreshedCustom = currentPres.activities?.find?.(a => a.type === ActivityType.Custom || a.type === 4);
              const refreshedStatus = text(refreshedCustom?.state || refreshedCustom?.details).toLowerCase();

              if (!refreshedStatus.includes(searchText) && freshMember.roles.cache.has(t.roleId)) {
                await freshMember.roles.remove(t.roleId);
                logger.info(`[presenceStatusRoles] Rol ${t.roleId} removido de ${freshMember.user?.tag || freshMember.id}`, {
                  userId: freshMember.id,
                  roleId: t.roleId,
                  guildId: pres.guild.id
                });
              }
            } catch (err) {
              logger.warn(`[presenceStatusRoles] Error al remover rol ${t.roleId} de ${member.id}:`, err?.message);
            }
          }, REMOVE_DELAY_MS);

          pendingRemove.set(removeKey, timeout);
        }
      }
    }
  } catch (e) {
    logger.warn('[presenceStatusRoles] Error en presencia:', e?.message || e);
  }
}

function stopPresenceStatusRoles() {
  for (const [key, timeout] of pendingRemove.entries()) {
    clearTimeout(timeout);
  }
  pendingRemove.clear();
  userCooldown.clear();
}

function initPresenceStatusRoles(client) {
  client.on(Events.PresenceUpdate, handlePresenceUpdate);
  return { stop: stopPresenceStatusRoles };
}

module.exports = Object.assign(initPresenceStatusRoles, {
  handlePresenceUpdate,
  stopPresenceStatusRoles,
  resolveMemberTriggers,
  checkAndSetCooldown,
  userCooldown,
  pendingRemove,
  COOLDOWN_MS,
  REMOVE_DELAY_MS
});