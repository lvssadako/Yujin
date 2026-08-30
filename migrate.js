const fs = require('fs');
const path = require('path');

console.log('🔄 Iniciando migración de badges...');

const profilePath = path.join(__dirname, 'data', 'profile.json');

// Leer archivo actual
let profiles;
try {
  profiles = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  console.log('✅ Archivo profile.json cargado');
} catch (err) {
  console.error('❌ Error leyendo profile.json:', err.message);
  process.exit(1);
}

// Verificar si hay algo que migrar
if (!profiles.guilds) {
  console.log('ℹ️ No hay estructura "guilds" para migrar. Ya estás usando "users".');
  process.exit(0);
}

// Crear estructura users si no existe
profiles.users = profiles.users || {};

let totalMigrated = 0;

// Migrar cada guild
for (const [guildId, guildUsers] of Object.entries(profiles.guilds)) {
  console.log(`\n🏰 Procesando guild: ${guildId}`);
  profiles.users[guildId] = profiles.users[guildId] || {};
  
  // Migrar cada usuario
  for (const [userId, oldData] of Object.entries(guildUsers)) {
    const earnedBadges = oldData.earnedBadges || [];
    
    if (!profiles.users[guildId][userId]) {
      // Crear nuevo usuario
      profiles.users[guildId][userId] = {
        earnedBadges: earnedBadges,
        equippedBadges: [],
        title: '',
        accent: '#e94560',
        bgUrl: '',
        bgOpacity: 0.25,
        streakDays: 0,
        lastActiveDay: 0
      };
      console.log(`  ✨ Creado usuario ${userId} con ${earnedBadges.length} badges`);
    } else {
      // Merge badges existentes
      const existing = new Set(profiles.users[guildId][userId].earnedBadges || []);
      const before = existing.size;
      
      for (const badgeId of earnedBadges) {
        existing.add(badgeId);
      }
      
      profiles.users[guildId][userId].earnedBadges = Array.from(existing);
      const added = existing.size - before;
      
      if (added > 0) {
        console.log(`  🔄 Actualizado usuario ${userId}: +${added} badges (total: ${existing.size})`);
      } else {
        console.log(`  ✓ Usuario ${userId}: sin cambios (${existing.size} badges)`);
      }
    }
    
    totalMigrated++;
  }
}

// Crear backup del archivo original
const backupPath = profilePath + '.pre-migration-' + Date.now();
try {
  fs.writeFileSync(backupPath, JSON.stringify(profiles, null, 2));
  console.log(`\n💾 Backup creado: ${path.basename(backupPath)}`);
} catch (err) {
  console.error('❌ Error creando backup:', err.message);
  process.exit(1);
}

// Eliminar estructura antigua
delete profiles.guilds;
console.log('\n🗑️ Estructura "guilds" eliminada');

// Guardar archivo actualizado
try {
  fs.writeFileSync(profilePath, JSON.stringify(profiles, null, 2));
  console.log('✅ Archivo profile.json actualizado');
} catch (err) {
  console.error('❌ Error guardando profile.json:', err.message);
  console.log('⚠️ Puedes restaurar el backup manualmente');
  process.exit(1);
}

console.log(`\n✅ Migración completada: ${totalMigrated} usuarios procesados`);
console.log('🚀 Reinicia el bot para aplicar cambios\n');