const logger = require('../utils/logger');
const { Events } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');

module.exports = (client) => {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      const wasBooster = Boolean(oldMember.premiumSince);
      const isBooster = Boolean(newMember.premiumSince);

      // Solo actuar si cambió el estado de boost
      if (wasBooster === isBooster) return;

      const profiles = readProfiles();
      const user = ensureUser(profiles, newMember.guild.id, newMember.id);

      // Perdió el boost
      if (wasBooster && !isBooster) {
        logger.info(`[boostRestore] ${newMember.user.tag} perdió boost, guardando perfil personalizado`);
        
        // Guardar la configuración actual en un backup
        user.boosterBackup = {
          title: user.title || '',
          accent: user.accent || '#e94560',
          bgUrl: user.bgUrl || '',
          bgOpacity: user.bgOpacity || 0.7,
          equippedBadges: user.equippedBadges || []
        };

        // Resetear a valores por defecto
        user.title = '';
        user.accent = '#e94560';
        user.bgUrl = '';
        user.bgOpacity = 0.7;
        user.equippedBadges = [];

        writeProfiles(profiles);
        
        // Notificar al usuario (opcional)
        try {
          await newMember.send('💔 Has dejado de boostear el servidor. Tu perfil personalizado ha sido guardado y se restaurará si vuelves a boostear.');
        } catch {}
      }

      // Ganó/recuperó el boost
      if (!wasBooster && isBooster) {
        logger.info(`[boostRestore] ${newMember.user.tag} ganó boost`);
        
        // Restaurar backup si existe
        if (user.boosterBackup) {
          logger.info(`[boostRestore] Restaurando perfil personalizado de ${newMember.user.tag}`);
          
          user.title = user.boosterBackup.title || '';
          user.accent = user.boosterBackup.accent || '#e94560';
          user.bgUrl = user.boosterBackup.bgUrl || '';
          user.bgOpacity = user.boosterBackup.bgOpacity || 0.7;
          user.equippedBadges = user.boosterBackup.equippedBadges || [];

          writeProfiles(profiles);

          // Notificar al usuario
          try {
            await newMember.send('🚀 ¡Bienvenido de vuelta, Booster! Tu perfil personalizado ha sido restaurado.');
          } catch {}
        } else {
          // Primer boost, no hay backup
          try {
            await newMember.send('🎉 ¡Gracias por boostear! Ahora puedes personalizar tu perfil con `/profileset`.');
          } catch {}
        }
      }
    } catch (err) {
      logger.error('[boostRestore] Error:', err);
    }
  });
};