const { createBackup } = require('../services/economy/economyBackupService');

function backupEconomyDaily(options) {
  return createBackup(options);
}

module.exports = { backupEconomyDaily };
