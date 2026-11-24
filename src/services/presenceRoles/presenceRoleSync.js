const { ActivityType } = require('discord.js');
const { groupTriggersByRole, decideRole } = require('./roleDecision');

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CONFIG_TTL_MS = 15 * 1000;

const customText = activities => {
  const custom = activities?.find?.(a => a.type === ActivityType.Custom || a.type === 4);
  return String(custom?.state || custom?.details || '').trim();
};

/**
 * Sincroniza el rol de agradecimiento por (a) enlace del servidor en el estado y (b) tag del servidor.
 * Nunca quita un rol por estar offline/invisible: sin presencia visible no hay evidencia de que lo haya quitado.
 */
function createPresenceRoleSync({ readConfig, resolveTriggers, validateRole, logger = { info() {}, warn() {} }, now = Date.now }) {
  let cached = null;
  let cachedAt = 0;

  function triggers() {
    if (!cached || now() - cachedAt > CONFIG_TTL_MS) {
      cached = resolveTriggers(readConfig());
      cachedAt = now();
    }
    return cached;
  }

  async function setRole(guild, member, roleId, shouldHave, why) {
    const has = member.roles.cache.has(roleId);
    if (has === shouldHave) return false;
    if (!validateRole(guild, roleId, `presence ${why}`).valid) return false;
    try {
      if (shouldHave) await member.roles.add(roleId, `Agradecimiento: ${why}`);
      else await member.roles.remove(roleId, `Ya no cumple: ${why}`);
      logger.info(`[presenceRoles] ${shouldHave ? 'Otorgado' : 'Retirado'} rol ${roleId} (${why})`, { userId: member.id, guildId: guild.id });
      return true;
    } catch (e) {
      logger.warn('[presenceRoles] No se pudo actualizar el rol', { userId: member.id, roleId, error: e?.message });
      return false;
    }
  }

  /** Evalúa cada rol una sola vez con todas sus reglas (enlace O tag). Devuelve cuántos roles cambió. */
  async function syncMember(member, presence = null, only = null) {
    if (!member || member.user?.bot) return 0;
    const visible = Boolean(presence && presence.status !== 'offline' && presence.status !== 'invisible');
    const text = visible ? customText(presence.activities) : '';
    let changed = 0;
    for (const [roleId, group] of groupTriggersByRole(triggers())) {
      if (only === 'tag' && !group.tag) continue;
      if (only === 'status' && !group.status.length) continue;
      const shouldHave = decideRole(group, { text, visible, user: member.user, guildId: member.guild.id });
      if (shouldHave === null) continue; // sin presencia visible no hay evidencia de que quitara el enlace
      const why = group.tag && group.status.length ? 'enlace en el estado o tag del servidor' : group.tag ? 'tag del servidor' : 'enlace en el estado';
      if (await setRole(member.guild, member, roleId, shouldHave, why)) changed += 1;
    }
    return changed;
  }

  /** Tag del servidor: cambia con el perfil, no con la presencia. */
  const syncMemberTag = member => syncMember(member, member?.presence || null, 'tag');

  /** Enlace en el estado: solo con presencia visible (online/idle/dnd). */
  const syncMemberStatus = (member, presence) => syncMember(member, presence, 'status');

  /** Reconciliación completa (al iniciar y cada 6 h): corrige lo ocurrido con el bot apagado. */
  async function reconcileGuild(guild) {
    const all = triggers();
    const result = { status: 0, tag: 0 };
    if (!all.length) return result;
    if (all.some(t => t.field === 'status')) {
      for (const presence of guild.presences?.cache?.values?.() || []) {
        const member = guild.members.cache.get(presence.userId);
        if (member) result.status += await syncMemberStatus(member, presence);
      }
    }
    if (all.some(t => t.field === 'tag')) {
      const members = await guild.members.fetch();
      for (const member of members.values()) result.tag += await syncMemberTag(member);
    }
    return result;
  }

  function start(client, intervalMs = SWEEP_INTERVAL_MS) {
    const run = async () => {
      for (const guild of client.guilds.cache.values()) {
        try { await reconcileGuild(guild); }
        catch (e) { logger.warn('[presenceRoles] Reconciliación fallida', { guildId: guild.id, error: e?.message }); }
      }
    };
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    run();
    return () => { clearInterval(timer); cached = null; };
  }

  return { syncMemberTag, syncMemberStatus, reconcileGuild, start };
}

module.exports = { createPresenceRoleSync, SWEEP_INTERVAL_MS, CONFIG_TTL_MS };
