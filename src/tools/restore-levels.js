const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('Uso: node tools/restore-levels.js data/levels.backup.1762618932660.json');
  process.exit(1);
}

const levelsPath = path.join(__dirname, '..', '..', 'data', 'levels.json');

function normalize(input) {
  const out = { guilds: {} };

  // 1) Si ya trae .guilds, mezclar
  if (input.guilds && typeof input.guilds === 'object') {
    for (const g of Object.keys(input.guilds)) {
      out.guilds[g] = { ...(out.guilds[g] || {}), ...input.guilds[g] };
    }
  }

  // 2) Copiar datos que estén en la raíz (IDs de guild) a .guilds
  for (const k of Object.keys(input)) {
    if (k === 'guilds') continue;
    if (/^\d{17,19}$/.test(k)) {
      out.guilds[k] = { ...(out.guilds[k] || {}), ...input[k] };
    }
  }

  // 3) Normalizar campos por usuario (voiceTime -> voiceMinutes si no existe)
  for (const g of Object.keys(out.guilds)) {
    for (const u of Object.keys(out.guilds[g])) {
      const user = out.guilds[g][u] || {};
      if (user.voiceMinutes == null && typeof user.voiceTime === 'number') {
        user.voiceMinutes = Math.round(user.voiceTime / 60);
      }
      if (user.xp == null) user.xp = 0;
      if (user.level == null) user.level = 0;
      if (user.messages == null) user.messages = 0;
      out.guilds[g][u] = user;
    }
  }

  return out;
}

// Leer backup
const raw = fs.readFileSync(src, 'utf8');
const parsed = JSON.parse(raw);

// Backup del levels.json actual por si acaso
try {
  const stamp = Date.now();
  const bak = path.join(__dirname, '..', '..', 'data', `levels.json.pre-restore.${stamp}.bak`);
  if (fs.existsSync(levelsPath)) fs.copyFileSync(levelsPath, bak);
  console.log('Backup del levels.json actual:', path.basename(bak));
} catch {}

// Normalizar y escribir
const normalized = normalize(parsed);
fs.writeFileSync(levelsPath, JSON.stringify(normalized, null, 2), 'utf8');

const guilds = Object.keys(normalized.guilds);
console.log('Restaurado correctamente.');
console.log('Guilds:', guilds);
if (guilds[0]) {
  const sampleUsers = Object.keys(normalized.guilds[guilds[0]]).slice(0, 5);
  console.log('Usuarios de muestra en', guilds[0], ':', sampleUsers);
}