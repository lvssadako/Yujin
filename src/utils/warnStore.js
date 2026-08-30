
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('./jsonStore');
const filePath = path.join(__dirname, '../../data/warns.json');

function readWarns() {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function writeWarns(data) { writeJsonAtomic(filePath, data); }
module.exports = { readWarns, writeWarns };
