const { PermissionFlagsBits } = require('discord.js');

const SWEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Quita los roles de color de Booster a quien ya no es booster.
 * Las dependencias se inyectan para poder probarlo sin disco ni Discord.
 */
function createBoosterColorCleanup({ getConfig, isMemberBooster, logger = { warn() {}, info() {} } }) {
  function colorRoleIds(guildId) {
    return new Set((getConfig(guildId).colors || []).map(c => c.roleId).filter(Boolean));
  }

  function canManage(guild, roleIds) {
    const me = guild.members?.me;
    if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) return false;
    return [...roleIds].every(id => {
      const role = guild.roles.cache.get(id);
      return !role || me.roles.highest.position > role.position;
    });
  }

  /** @returns {Promise<string[]>} ids de rol retirados */
  async function revokeIfNotBooster(member, ids = colorRoleIds(member.guild.id)) {
    if (!member || isMemberBooster(member) || ids.size === 0) return [];
    const toRemove = [...member.roles.cache.keys()].filter(id => ids.has(id));
    if (toRemove.length === 0) return [];
    if (!canManage(member.guild, toRemove)) {
      logger.warn('[boosterColors] Sin permisos o jerarquía para quitar colores a un ex-booster', { guildId: member.guild.id });
      return [];
    }
    try {
      await member.roles.remove(toRemove, 'Dejó de ser Booster: se retira su color exclusivo');
      return toRemove;
    } catch (e) {
      logger.warn('[boosterColors] No se pudo quitar el color de un ex-booster', { userId: member.id, error: e?.message });
      return [];
    }
  }

  /** Reacciona al evento: solo actúa si el miembro dejó de ser booster (o si el estado previo es desconocido). */
  async function handleMemberUpdate(oldMember, newMember) {
    if (isMemberBooster(newMember)) return [];
    if (!oldMember?.partial && oldMember && !isMemberBooster(oldMember)) return [];
    return revokeIfNotBooster(newMember);
  }

  /** Barrido para ex-boosters que ya conservaban el color antes de este arreglo (o si el bot estuvo caído). */
  async function sweepGuild(guild) {
    const ids = colorRoleIds(guild.id);
    if (ids.size === 0) return { checked: 0, cleaned: 0 };
    const members = await guild.members.fetch();
    let checked = 0; let cleaned = 0;
    for (const member of members.values()) {
      if (![...member.roles.cache.keys()].some(id => ids.has(id))) continue;
      checked += 1;
      if ((await revokeIfNotBooster(member, ids)).length) cleaned += 1;
    }
    if (cleaned) logger.info('[boosterColors] Colores retirados a ex-boosters', { guildId: guild.id, cleaned });
    return { checked, cleaned };
  }

  function startSweeper(client, intervalMs = SWEEP_INTERVAL_MS) {
    const run = async () => {
      for (const guild of client.guilds.cache.values()) {
        try { await sweepGuild(guild); }
        catch (e) { logger.warn('[boosterColors] Barrido fallido', { guildId: guild.id, error: e?.message }); }
      }
    };
    run();
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return { revokeIfNotBooster, handleMemberUpdate, sweepGuild, startSweeper };
}

module.exports = { createBoosterColorCleanup, SWEEP_INTERVAL_MS };
