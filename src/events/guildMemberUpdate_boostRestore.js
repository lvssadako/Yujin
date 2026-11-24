const logger = require('../utils/logger');
const { Events } = require('discord.js');
const profileStore = require('../utils/profileStore');
const { sendDmNotification } = require('../services/notification/dmNotificationService');
const { createBoosterProfileService } = require('../services/boost/boosterProfileService');

// Al dejar de boostear se guarda y retira el fondo propio (si no hay otro acceso); si vuelve, se restaura.
// El agradecimiento por el primer boost ya lo envía boostTracker: aquí solo se avisa lo del fondo.
module.exports = (client) => {
  const service = createBoosterProfileService({
    readProfiles: profileStore.readProfiles,
    writeProfiles: profileStore.writeProfiles,
    ensureUser: profileStore.ensureUser,
    accessFor: (member, user) => require('../services/profile/profileBackgroundService').getProfileBackgroundService().accessFor(member, user),
    imageService: require('../services/image/imageService')
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      if (!newMember?.guild || newMember.user?.bot) return;
      const isBooster = Boolean(newMember.premiumSince);
      const knownOld = Boolean(oldMember) && !oldMember.partial;
      const wasBooster = knownOld && Boolean(oldMember.premiumSince);
      const notify = content => sendDmNotification(newMember.user, {
        guildId: newMember.guild.id, guildName: newMember.guild.name, category: 'boosts', content
      });

      if (isBooster && !wasBooster) {
        const { restored } = service.onBoostGained(newMember);
        if (restored) {
          logger.info(`[boostRestore] Fondo restaurado a ${newMember.user.tag}`);
          await notify(`🚀 ¡Bienvenido de vuelta, Booster! Tu fondo de perfil personalizado en **${newMember.guild.name}** fue restaurado.`);
        }
      } else if (!isBooster && wasBooster) {
        const { cleared } = await service.onBoostLost(newMember);
        if (cleared) {
          logger.info(`[boostRestore] Fondo guardado y retirado a ${newMember.user.tag}`);
          await notify(`💔 Dejaste de boostear **${newMember.guild.name}**: tu fondo de perfil personalizado se guardó y ya no se muestra. Se restaurará si vuelves a boostear, o puedes conservarlo con el Pase de Fondo (\`/fondo comprar\`).`);
        }
      }
    } catch (err) {
      logger.error('[boostRestore] Error:', err);
    }
  });
};
