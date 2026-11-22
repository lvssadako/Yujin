const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

// Activa el boost si no hay otro en curso; si lo hay, lo deja en la cola del usuario.
function grantBoostToUser(guildId, userId, boostDef, quantity = 1) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  u.xpBoostsQueue ||= [];
  u.xpBoostsActive ||= [];
  const now = Date.now();
  u.xpBoostsActive = u.xpBoostsActive.filter(b => b.expiresAt > now);
  const multiplier = Number(boostDef.multiplier) || 1;
  const durationMs = Number(boostDef.durationMs) || 3600000;
  for (let i = 0; i < quantity; i++) {
    if (u.xpBoostsActive.length === 0) u.xpBoostsActive.push({ id: boostDef.id, multiplier, expiresAt: now + durationMs });
    else u.xpBoostsQueue.push({ id: boostDef.id, multiplier, durationMs });
  }
  writeProfiles(profiles);
}

module.exports = { grantBoostToUser };
