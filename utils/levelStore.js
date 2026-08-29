const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

let writeLock = Promise.resolve();

function readLevels() {
  try { 
    return JSON.parse(fs.readFileSync(levelsPath, 'utf8')); 
  } catch { 
    return {}; 
  }
}

async function writeLevels(obj) {
  writeLock = writeLock.then(async () => {
    fs.mkdirSync(dataDir, { recursive: true });

    // Escritura atómica
    const tmp = levelsPath + '.tmp';
    const json = JSON.stringify(obj, null, 2);
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, levelsPath);

    // Backup diario + retención 7
    try {
      const day = new Date().toISOString().slice(0, 10);
      const bname = `levels.backup.${day}.json`;
      const bpath = path.join(dataDir, bname);

      if (!fs.existsSync(bpath) && fs.existsSync(levelsPath)) {
        fs.copyFileSync(levelsPath, bpath);
        console.log('[levelStore] Backup creado:', bname);
      }

      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('levels.backup.') && f.endsWith('.json'))
        .sort();
      const toDelete = files.slice(0, Math.max(0, files.length - 7));
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(dataDir, f)); } catch {}
      }
    } catch {}
  });
  return writeLock;
}

function ensureUserData(levels, guildId, userId, profiles) {
  if (!levels[guildId]) levels[guildId] = {};
  if (!levels[guildId][userId]) {
    levels[guildId][userId] = { xp: 0, level: 0, messages: 0, voiceTime: 0 };
  }
  return levels[guildId][userId];
}

module.exports = { readLevels, writeLevels, ensureUserData };