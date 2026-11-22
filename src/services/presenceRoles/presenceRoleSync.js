const { ActivityType } = require('discord.js');
const { buildStatusMatcher, hasServerTag } = require('./statusMatcher');

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

  /** Tag del servidor: evaluable en cualquier momento (no depende de la presencia). */
  async function syncMemberTag(member) {
    if (!member || member.user?.bot) return 0;
    let changed = 0;
    for (const t of triggers().filter(x => x.field === 'tag')) {
      if (await setRole(member.guild, member, t.roleId, hasServerTag(member.user, member.guild.id), 'tag del servidor')) changed += 1;
    }
    return changed;
  }

  /** Enlace en el estado: solo con presencia visible (online/idle/dnd). */
  async function syncMemberStatus(member, presence) {
    if (!member || member.user?.bot || !presence || presence.status === 'offline' || presence.status === 'invisible') return 0;
    const text = customText(presence.activities);
    let changed = 0;
    for (const t of triggers().filter(x => x.field === 'status')) {
      if (await setRole(member.guild, member, t.roleId, buildStatusMatcher(t.includes)(text), 'enlace en el estado')) changed += 1;
    }
    return changed;
  }

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
