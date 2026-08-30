const logger = require('../utils/logger');
const { Events } = require('discord.js');
const { readConfig } = require('../utils/configCache');
const { setStart, popElapsedMinutes, clearTimer } = require('../utils/roleTimeStore');
const { updateMissionProgress } = require('../utils/dailyMissions');

module.exports = (client) => {
  client.on(Events.GuildMemberUpdate, async (oldM, newM) => {
    try {
      const cfg = readConfig();
      const roleId = cfg.statusRoleId || cfg.status?.roleId;
      if (!roleId) return;
      if (newM.guild.roles.cache.get(roleId) == null) return;

      const had = oldM?.roles?.cache?.has(roleId);
      const has = newM?.roles?.cache?.has(roleId);

      // Rol agregado → iniciar contador
      if (!had && has) {
        setStart(newM.guild.id, newM.id, roleId, Date.now());
        return;
      }
      // Rol removido → sumar minutos transcurridos y limpiar
      if (had && !has) {
        const mins = popElapsedMinutes(newM.guild.id, newM.id, roleId, Date.now());
        if (mins > 0) updateMissionProgress(newM.guild, newM.id, 'role_time', mins);
        clearTimer(newM.guild.id, newM.id, roleId);
      }
    } catch (e) {
      logger.warn('[role_time] Error:', e?.message);
    }
  });
};