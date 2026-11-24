const { WALLPAPER_PRESETS } = require('../../constants/profileThemes');

const presetUrls = () => new Set(Object.values(WALLPAPER_PRESETS).map(w => w.url));

/**
 * Qué pasa con el perfil cuando alguien deja de boostear o vuelve a hacerlo.
 * Solo se toca lo que hoy depende del boost: el fondo con imagen propia. El título, los colores y la galería
 * de wallpapers son gratis para todos, así que NO se reinician. Si conserva acceso por otra vía (Pase de Fondo
 * o racha de 360+ días) el fondo se queda. El estado `boosterProfileState` vuelve idempotente cada transición.
 */
function createBoosterProfileService({ readProfiles, writeProfiles, ensureUser, accessFor, imageService, now = Date.now }) {
  /** @returns {Promise<{cleared: boolean}>} */
  async function onBoostLost(member) {
    const guildId = member.guild.id; const userId = member.id;
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    if (user.boosterProfileState === 'lost') return { cleared: false };

    user.boosterProfileState = 'lost';
    let cleared = false;
    const customBackground = Boolean(user.bgUrl) && !presetUrls().has(user.bgUrl);
    if (customBackground && !accessFor(member, user).allowed) {
      user.boosterBackup = { bgUrl: user.bgUrl, bgOpacity: user.bgOpacity ?? 0.7, savedAt: now() };
      user.bgUrl = '';
      cleared = true;
    }
    writeProfiles(profiles);
    if (cleared) await imageService.deleteUserProfileBackground(guildId, userId);
    return { cleared };
  }

  /** @returns {{restored: boolean}} */
  function onBoostGained(member) {
    const profiles = readProfiles();
    const user = ensureUser(profiles, member.guild.id, member.id);
    if (user.boosterProfileState !== 'lost' && !user.boosterBackup) return { restored: false };

    let restored = false;
    const backup = user.boosterBackup;
    // Si mientras tanto eligió otro fondo (galería, pase…), no se lo pisamos.
    if (backup?.bgUrl && !user.bgUrl) {
      user.bgUrl = backup.bgUrl;
      if (Number.isFinite(backup.bgOpacity)) user.bgOpacity = backup.bgOpacity;
      restored = true;
    }
    user.boosterBackup = null;
    user.boosterProfileState = 'active';
    writeProfiles(profiles);
    return { restored };
  }

  return { onBoostLost, onBoostGained };
}

module.exports = { createBoosterProfileService };
