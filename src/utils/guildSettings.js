
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./jsonStore');
const filePath = path.join(__dirname, '../../data/guildSettings.json');

function readSettings() {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function writeSettings(data) { writeJsonAtomic(filePath, data); }
module.exports = { readSettings, writeSettings };
