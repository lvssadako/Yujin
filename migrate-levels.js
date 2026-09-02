const fs = require('fs');
const path = require('path');

const levelsPath = path.join(__dirname, 'data', 'levels.json');

console.log('[MIGRATE] Leyendo levels.json...');
const data = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));

// Si ya tiene la estructura correcta, salir
if (data.guilds && Object.keys(data.guilds).length > 0 && Object.keys(data).length === 1) {
  console.log('[MIGRATE] Ya está en la estructura correcta.');
  process.exit(0);
}

// Crear nueva estructura
const migrated = { guilds: {} };

// Copiar datos de la raíz a guilds
for (const key in data) {
  if (key === 'guilds') {
    // Ya están en guilds, copiar directamente
    Object.assign(migrated.guilds, data.guilds);
  } else if (/^\d{17,19}$/.test(key)) {
    // Es un guild ID (17-19 dígitos)
    migrated.guilds[key] = { ...(migrated.guilds[key] || {}), ...data[key] };
  }
}

// Backup del archivo original
const backupPath = path.join(__dirname, 'data', `levels.backup.${Date.now()}.json`);
fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
console.log('[MIGRATE] Backup creado:', backupPath);

// Guardar migración
fs.writeFileSync(levelsPath, JSON.stringify(migrated, null, 2));
console.log('[MIGRATE] ✅ Migración completada.');
console.log('[MIGRATE] Estructura anterior:', Object.keys(data).length, 'claves');
console.log('[MIGRATE] Estructura nueva:', Object.keys(migrated.guilds).length, 'guilds');