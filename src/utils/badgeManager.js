const logger = require('./utils/logger');
const { readProfiles, writeProfiles, ensureUser } = require('./profileStore');
const { readLevels } = require('./levelStore');

async function checkAndGrantBadges(guild, userId) {
  const profiles = readProfiles();
  const levels = readLevels();
  const guildId = guild.id;
  
  const userProfile = ensureUser(profiles, guildId, userId);
  userProfile.earnedBadges = userProfile.earnedBadges || [];
  
  const guildData = levels.guilds?.[guildId] || levels[guildId] || {};
  const userData = guildData[userId] || { level: 0, xp: 0, messages: 0, voiceMinutes: 0 };

  const allBadges = Object.values(profiles.badges || {}).filter(b => b.type === 'achievement' && b.autoGrant);
  const newBadges = [];

  for (const badge of allBadges) {
    if (userProfile.earnedBadges.includes(badge.id)) continue; // Ya la tiene

    const c = badge.autoGrant;
    let ok = true;

    // Verificar nivel
    if (c.minLevel && (userData.level || 0) < c.minLevel) {
      ok = false;
    }

    // Verificar mensajes
    if (ok && c.minMessages && (userData.messages || 0) < c.minMessages) {
      ok = false;
    }

    // Verificar tiempo en voz
    if (ok && c.minVoiceMinutes) {
      const voiceMs = userData.voiceMs || 0;
      const voiceMinutes = Math.floor(voiceMs / 60000);
      if (voiceMinutes < c.minVoiceMinutes) {
        ok = false;
      }
    }

    // Verificar racha
    if (ok && c.minStreakDays && (userProfile.streakDays || 0) < c.minStreakDays) {
      ok = false;
    }

    // Verificar booster
    if (ok && c.isBooster) {
      try {
        const member = await guild.members.fetch(userId);
        if (!member.premiumSince) {
          ok = false;
        }
      } catch {
        ok = false;
      }
    }

    // Si cumple todas las condiciones, otorgar
    if (ok) {
      userProfile.earnedBadges.push(badge.id);
      newBadges.push(badge);
      logger.info(`[badges] ${userId} desbloqueó: ${badge.name}`);
    }
  }

  if (newBadges.length > 0) {
    writeProfiles(profiles);
  }

  return newBadges;
}

function getUserBadges(guildId, userId) {
  const profiles = readProfiles();
  const userProfile = ensureUser(profiles, guildId, userId);
  
  const earnedIds = userProfile.earnedBadges || [];
  const equippedIds = userProfile.equippedBadges || [];
  
  const earned = earnedIds.map(id => profiles.badges?.[id]).filter(Boolean);
  const equipped = equippedIds.map(id => profiles.badges?.[id]).filter(Boolean);
  
  return { earned, equipped };
}

module.exports = {
  checkAndGrantBadges,
  getUserBadges
};