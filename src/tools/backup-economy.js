const { createBackup } = require('../services/economy/economyBackupService');

if (require.main === module) {
  try {
    const backup = createBackup();
    console.log(backup ? `Copia económica conjunta creada: ${backup}` : 'No hay estado económico para respaldar.');
  } catch (error) {
    console.error('No se pudo crear la copia económica:', error.message);
    process.exitCode = 1;
  }
}

module.exports = { backupEconomy: createBackup };
