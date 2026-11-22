const { normalizeExternalImageUrl } = require('../../utils/urlSafety');
const { WALLPAPER_PRESETS } = require('../../constants/profileThemes');
const { PROFILE_BG_PRODUCT_ID, getProduct, formatPrice } = require('../../constants/paymentCatalog');
const { getBackgroundAccess, resolveStreakDays, REQUIRED_STREAK_DAYS } = require('./backgroundAccess');

const lockedMessage = () =>
  `🔒 Los fondos con tu propia imagen requieren ser **Booster**, tener una **racha de ${REQUIRED_STREAK_DAYS}+ días** o comprar el **Pase de Fondo** (${formatPrice(getProduct(PROFILE_BG_PRODUCT_ID))}, pago único) con \`/fondo comprar\`.\n*Los wallpapers de la galería siguen siendo gratis.*`;

const presetUrls = () => new Set(Object.values(WALLPAPER_PRESETS).map(w => w.url));

/**
 * Único punto de entrada para cambiar el fondo del perfil.
 * Los comandos, botones y el flujo de pagos pasan por aquí; nadie más escribe bgUrl.
 */
function createProfileBackgroundService(deps) {
  const { readProfiles, writeProfiles, ensureUser, hasPass, imageService } = deps;

  function accessFor(member, profileUser) {
    return getBackgroundAccess({
      member,
      streakDays: resolveStreakDays(profileUser),
      hasPass: hasPass(member.guild.id, member.id || member.user?.id)
    });
  }

  function getAccess(member) {
    const profiles = readProfiles();
    const user = ensureUser(profiles, member.guild.id, member.id || member.user.id);
    return accessFor(member, user);
  }

  async function setPreset(guildId, userId, presetId) {
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    if (presetId === 'none') {
      user.bgUrl = '';
      await imageService.deleteUserProfileBackground(guildId, userId);
    } else {
      const wallpaper = Object.prototype.hasOwnProperty.call(WALLPAPER_PRESETS, presetId) ? WALLPAPER_PRESETS[presetId] : null;
      if (!wallpaper) return { ok: false, error: 'Ese wallpaper no existe. Revisa la galería con /profileset.' };
      user.bgUrl = wallpaper.url;
      await imageService.saveUserProfileBackground(guildId, userId, wallpaper.url);
    }
    writeProfiles(profiles);
    return { ok: true, name: presetId === 'none' ? null : WALLPAPER_PRESETS[presetId].name };
  }

  /** Valida la URL antes de comprobar el pago o guardar nada. */
  function validateUrl(rawUrl) {
    const normalized = typeof rawUrl === 'string' ? normalizeExternalImageUrl(rawUrl.trim()) : null;
    return normalized ? { ok: true, url: normalized } : { ok: false, error: 'La URL no es válida o no es pública. Usa un enlace directo https a una imagen PNG, JPG o WEBP.' };
  }

  async function setCustomUrl(member, rawUrl) {
    const checked = validateUrl(rawUrl);
    if (!checked.ok) return { ok: false, code: 'invalid_url', error: checked.error };
    const guildId = member.guild.id;
    const userId = member.id || member.user.id;
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    const access = accessFor(member, user);
    if (!access.allowed) return { ok: false, code: 'locked', error: lockedMessage() };
    const saved = await imageService.saveUserProfileBackground(guildId, userId, checked.url);
    if (!saved.ok) return { ok: false, code: 'image_error', error: saved.error || 'No se pudo procesar la imagen.' };
    user.bgUrl = checked.url;
    writeProfiles(profiles);
    return { ok: true, size: saved.size || 0, reason: access.reason };
  }

  /** Tras un reembolso o contracargo: retira un fondo por URL si ya no hay acceso. */
  async function enforceAccess(guild, userId) {
    const profiles = readProfiles();
    const user = ensureUser(profiles, guild.id, userId);
    if (!user.bgUrl || presetUrls().has(user.bgUrl)) return { changed: false };
    const member = await guild.members.fetch(userId).catch(() => null);
    const access = member ? accessFor(member, user) : { allowed: false };
    if (access.allowed) return { changed: false };
    user.bgUrl = '';
    await imageService.deleteUserProfileBackground(guild.id, userId);
    writeProfiles(profiles);
    return { changed: true };
  }

  return { getAccess, setPreset, setCustomUrl, validateUrl, enforceAccess, accessFor };
}

let singleton = null;
function getProfileBackgroundService() {
  if (!singleton) {
    const profileStore = require('../../utils/profileStore');
    singleton = createProfileBackgroundService({
      readProfiles: profileStore.readProfiles,
      writeProfiles: profileStore.writeProfiles,
      ensureUser: profileStore.ensureUser,
      hasPass: (guildId, userId) => require('../payments/paymentsService').getStore().hasEntitlement(guildId, userId, PROFILE_BG_PRODUCT_ID),
      imageService: require('../image/imageService')
    });
  }
  return singleton;
}

module.exports = { createProfileBackgroundService, getProfileBackgroundService, lockedMessage };
