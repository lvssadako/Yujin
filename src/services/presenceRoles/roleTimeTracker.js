const { statusRoleIds } = require('./statusRoleIds');

const TICK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Cuenta el tiempo que cada usuario conserva el rol de "enlace en el estado" para la misión diaria `role_time`.
 * Antes solo se acreditaba al PERDER el rol (y el evento ni siquiera estaba cargado), así que la misión
 * no podía completarse. Ahora se acredita al ganar/perder el rol y cada 10 minutos mientras se conserva.
 */
function createRoleTimeTracker({ store, readConfig, updateMissionProgress, logger = { warn() {} }, now = Date.now }) {
  const credit = (guild, userId, roleId) => {
    const mins = store.popElapsedMinutes(guild.id, userId, roleId, now());
    if (mins > 0) updateMissionProgress(guild, userId, 'role_time', mins);
    return mins;
  };

  /** GuildMemberUpdate: ganar el rol inicia el contador; perderlo acredita lo transcurrido y lo cierra. */
  function handleMemberUpdate(oldMember, newMember) {
    if (!newMember?.guild || newMember.user?.bot) return;
    for (const roleId of statusRoleIds(readConfig())) {
      if (!newMember.guild.roles.cache.has(roleId)) continue;
      const had = Boolean(oldMember?.roles?.cache?.has(roleId));
      const has = Boolean(newMember.roles?.cache?.has(roleId));
      if (!had && has) store.setStart(newMember.guild.id, newMember.id, roleId, now());
      else if (had && !has) {
        credit(newMember.guild, newMember.id, roleId);
        store.clearTimer(newMember.guild.id, newMember.id, roleId);
      }
    }
  }

  /** Acredita a quien conserva el rol y arranca el contador de quien ya lo tenía antes de iniciar el bot. */
  function tickGuild(guild) {
    let credited = 0;
    for (const roleId of statusRoleIds(readConfig())) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const member of role.members.values()) {
        if (member.user?.bot) continue;
        const timer = store.ensureTimer(guild.id, member.id, roleId);
        if (!timer.startAt) { store.setStart(guild.id, member.id, roleId, now()); continue; }
        credited += credit(guild, member.id, roleId);
      }
    }
    return credited;
  }

  function start(client, intervalMs = TICK_INTERVAL_MS) {
    const run = () => {
      for (const guild of client.guilds.cache.values()) {
        try { tickGuild(guild); } catch (e) { logger.warn('[role_time] Tick fallido', { guildId: guild.id, error: e?.message }); }
      }
    };
    run();
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }

  return { handleMemberUpdate, tickGuild, start };
}

module.exports = { createRoleTimeTracker, TICK_INTERVAL_MS };
