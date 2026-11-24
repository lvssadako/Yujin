const logger = require('../utils/logger');
const { Events, ActivityType } = require('discord.js');
const { readConfig } = require('../utils/configCache');
const { validateRoleForAssignment } = require('../utils/roleValidation');
const { groupTriggersByRole, decideRole } = require('../services/presenceRoles/roleDecision');
const { createPresenceRoleSync } = require('../services/presenceRoles/presenceRoleSync');

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
  return triggers.filter(t => {
    if (!t || typeof t !== 'object' || typeof t.roleId !== 'string' || !t.roleId.trim()) return false;
    if (t.field === 'tag') return true; // el rol por tag del servidor no necesita texto
    return t.field === 'status' && typeof t.includes === 'string' && t.includes.trim().length > 0;
  });
}

async function handlePresenceUpdate(_old, pres, deps = {}) {
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

    const cfg = (deps.readConfig || readConfig)();
    const triggers = resolveMemberTriggers(cfg);
    if (!triggers.some(t => t.field === 'status')) return;

    const custom = pres.activities?.find?.(a => a.type === ActivityType.Custom || a.type === 4);
    const customStatus = text(custom?.state || custom?.details).toLowerCase();

    // Una sola decisión por ROL: se conserva si cualquiera de sus reglas (enlaces o tag) se cumple.
    for (const [roleId, group] of groupTriggersByRole(triggers)) {
      if (!group.status.length) continue; // los roles solo por tag se sincronizan en presenceRoleSync

      const validation = validateRoleForAssignment(pres.guild, roleId, 'presence status role');
      if (!validation.valid) {
        logger.warn(`[presenceStatusRoles] Invalid role ${roleId}: ${validation.reason}`);
        continue;
      }

      const shouldHave = decideRole(group, { text: customStatus, visible: true, user: member.user, guildId: pres.guild.id });
      const removeKey = `${member.id}:${roleId}`;

      if (shouldHave) {
        // Cancelar remoción pendiente si el usuario recuperó el texto
        if (pendingRemove.has(removeKey)) {
          clearTimeout(pendingRemove.get(removeKey));
          pendingRemove.delete(removeKey);
        }
        if (!member.roles.cache.has(roleId)) {
          try {
            await member.roles.add(roleId);
            logger.info(`[presenceStatusRoles] Rol ${roleId} otorgado a ${member.user?.tag || member.id}`, {
              userId: member.id,
              roleId,
              guildId: pres.guild.id
            });
          } catch (err) {
            logger.warn(`[presenceStatusRoles] Error al añadir rol ${roleId} a ${member.id}:`, err?.message);
          }
        }
      } else if (shouldHave === false) {
        // Si ninguna regla se cumple y tiene el rol, programar remoción con tiempo de gracia
        if (member.roles.cache.has(roleId) && !pendingRemove.has(removeKey)) {
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
              const stillNot = decideRole(group, { text: refreshedStatus, visible: true, user: freshMember.user, guildId: pres.guild.id }) === false;

              if (stillNot && freshMember.roles.cache.has(roleId)) {
                await freshMember.roles.remove(roleId);
                logger.info(`[presenceStatusRoles] Rol ${roleId} removido de ${freshMember.user?.tag || freshMember.id}`, {
                  userId: freshMember.id,
                  roleId,
                  guildId: pres.guild.id
                });
              }
            } catch (err) {
              logger.warn(`[presenceStatusRoles] Error al remover rol ${roleId} de ${member.id}:`, err?.message);
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

let stopSync = null;

function stopPresenceStatusRoles() {
  for (const [key, timeout] of pendingRemove.entries()) {
    clearTimeout(timeout);
  }
  pendingRemove.clear();
  userCooldown.clear();
  if (stopSync) { stopSync(); stopSync = null; }
}

function initPresenceStatusRoles(client) {
  client.on(Events.PresenceUpdate, (oldPresence, presence) => handlePresenceUpdate(oldPresence, presence));

  // Tag del servidor y reconciliación al iniciar / cada 6 h.
  const sync = createPresenceRoleSync({ readConfig, resolveTriggers: resolveMemberTriggers, validateRole: validateRoleForAssignment, logger });
  client.on(Events.GuildMemberUpdate, (_old, member) => {
    sync.syncMemberTag(member).catch(e => logger.warn('[presenceStatusRoles] Error sincronizando tag:', e?.message));
  });
  const begin = () => { if (!stopSync) stopSync = sync.start(client); };
  if (client.isReady?.()) begin(); else client.once(Events.ClientReady, begin);
  return { stop: stopPresenceStatusRoles, sync };
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