const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const profilePath = path.join(dataDir, 'profile.json');

function readProfiles() {
  try { 
    return JSON.parse(fs.readFileSync(profilePath, 'utf8')); 
  } catch { 
    return { users: {}, badges: {} }; 
  }
}

function writeProfiles(obj) {
  fs.mkdirSync(dataDir, { recursive: true });
  
  // Escritura atómica (igual que levelStore)
  const tmp = profilePath + '.tmp';
  const json = JSON.stringify(obj, null, 2);
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, profilePath);
  
  // Backup diario + retención 7
  try {
    const day = new Date().toISOString().slice(0, 10);
    const bname = `profile.backup.${day}.json`;
    const bpath = path.join(dataDir, bname);

    if (!fs.existsSync(bpath) && fs.existsSync(profilePath)) {
      fs.copyFileSync(profilePath, bpath);
      console.log('[profileStore] Backup creado:', bname);
    }

    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('profile.backup.') && f.endsWith('.json'))
      .sort();
    const toDelete = files.slice(0, Math.max(0, files.length - 7));
    for (const f of toDelete) {
      try { fs.unlinkSync(path.join(dataDir, f)); } catch {}
    }
  } catch {}
}

function ensureUser(profiles, guildId, userId) {
  if (!profiles.users) profiles.users = {};
  if (!profiles.users[guildId]) profiles.users[guildId] = {};
  if (!profiles.users[guildId][userId]) {
    profiles.users[guildId][userId] = {
      title: '',
      accent: '#e94560',
      bgUrl: '',
      bgOpacity: 0.25,
      equippedBadges: [],
      earnedBadges: [],
      streakDays: 0,
      lastActiveDay: 0
    };
  }
  return profiles.users[guildId][userId];
}

module.exports = { readProfiles, writeProfiles, ensureUser };