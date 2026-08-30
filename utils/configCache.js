const path = require('path');
const { readJsonSafe, deepMerge } = require('./jsonStore');

const rootPath = path.join(__dirname, '..', 'config.json');
const dataPath = path.join(__dirname, '..', 'data', 'config.json');

function readConfig() {
  const base = readJsonSafe(rootPath, {});
  const override = readJsonSafe(dataPath, {});
  return deepMerge(base, override);
}

module.exports = { readConfig };