// Regla única de acceso al fondo de perfil personalizado (URL).
// Acceso = Booster, racha actual >= 360 días o pase comprado y vigente.
const REQUIRED_STREAK_DAYS = 360;

function isBooster(member) {
  if (!member) return false;
  if (member.premiumSince) return true;
  const boosterRole = member.guild?.roles?.premiumSubscriberRole;
  return Boolean(boosterRole && member.roles?.cache?.has(boosterRole.id));
}

function resolveStreakDays(profileUser) {
  if (!profileUser || profileUser.streakDisabled) return 0;
  const days = Number(profileUser.streakDays);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
}

/**
 * @returns {{allowed: boolean, reason: 'booster'|'streak'|'pass'|null}}
 */
function getBackgroundAccess({ member, streakDays = 0, hasPass = false } = {}) {
  if (isBooster(member)) return { allowed: true, reason: 'booster' };
  if (Number(streakDays) >= REQUIRED_STREAK_DAYS) return { allowed: true, reason: 'streak' };
  if (hasPass === true) return { allowed: true, reason: 'pass' };
  return { allowed: false, reason: null };
}

module.exports = { REQUIRED_STREAK_DAYS, isBooster, resolveStreakDays, getBackgroundAccess };
