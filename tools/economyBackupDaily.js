const fs = require('fs');
const path = require('path');

const economyPath = path.join(__dirname, '..', 'data', 'economy.json');
const backupDir = path.join(__dirname, '..', 'data');

function backupEconomyDaily() {
  if (!fs.existsSync(economyPath)) return;
  const now = new Date();
  const stamp = now.toISOString().split('T')[0];
  const backupPath = path.join(backupDir, `economy.backup.${stamp}.json`);
  fs.copyFileSync(economyPath, backupPath);
  console.log('Backup diario de economía creado:', backupPath);
}

module.exports = { backupEconomyDaily };
