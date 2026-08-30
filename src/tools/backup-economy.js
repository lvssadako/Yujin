const fs = require('fs');
const path = require('path');

const economyPath = path.join(__dirname, '..', 'data', 'economy.json');
const backupDir = path.join(__dirname, '..', 'data');

function backupEconomy() {
  if (!fs.existsSync(economyPath)) return;
  const stamp = new Date().toISOString().split('T')[0];
  const backupPath = path.join(backupDir, `economy.backup.${stamp}.json`);
  fs.copyFileSync(economyPath, backupPath);
  console.log('Backup diario de economía creado:', backupPath);
}

backupEconomy();
