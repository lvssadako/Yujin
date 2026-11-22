const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { getConfig, isMemberBooster } = require('../services/boost/boosterColorService');
const { createBoosterColorCleanup } = require('../services/boost/boosterColorCleanup');

// Retira el color exclusivo cuando un miembro deja de ser Booster y barre a quienes ya lo conservaban.
function register(client) {
  const cleanup = createBoosterColorCleanup({ getConfig, isMemberBooster, logger });
  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    cleanup.handleMemberUpdate(oldMember, newMember).catch(e => logger.warn('[boosterColors] Error', { error: e?.message }));
  });
  const startSweep = () => { register.stopSweeper = cleanup.startSweeper(client); };
  if (client.isReady?.()) startSweep(); else client.once(Events.ClientReady, startSweep);
  return cleanup;
}
register.stopSweeper = null;
register.stop = () => { register.stopSweeper?.(); register.stopSweeper = null; };

module.exports = register;
