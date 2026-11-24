const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { readConfig } = require('../utils/configCache');
const roleTimeStore = require('../utils/roleTimeStore');
const { updateMissionProgress } = require('../utils/dailyMissions');
const { createRoleTimeTracker } = require('../services/presenceRoles/roleTimeTracker');

let stopTicker = null;

// Misión diaria "lleva el enlace del servidor en tu estado": cuenta el tiempo con el rol de estado.
function register(client) {
  const tracker = createRoleTimeTracker({ store: roleTimeStore, readConfig, updateMissionProgress, logger });
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    try { tracker.handleMemberUpdate(oldMember, newMember); }
    catch (e) { logger.warn('[role_time] Error:', e?.message); }
  });
  const begin = async () => {
    // Para saber quién ya tiene el rol al iniciar hay que tener los miembros en caché.
    for (const guild of client.guilds.cache.values()) await guild.members.fetch().catch(() => {});
    if (!stopTicker) stopTicker = tracker.start(client);
  };
  if (client.isReady?.()) begin(); else client.once(Events.ClientReady, begin);
  return tracker;
}

register.stop = () => { if (stopTicker) { stopTicker(); stopTicker = null; } };
module.exports = register;
