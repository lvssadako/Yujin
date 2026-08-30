const path = require('path');
const { readJsonSafe, deepMerge } = require('./jsonStore');
const { validateConfig } = require('./config/loader');

const defaultPath = path.join(__dirname, '..', '..', 'config', 'default.json');
const rootLegacyPath = path.join(__dirname, '..', '..', 'config.json');
const dataPath = path.join(__dirname, '..', '..', 'data', 'config.json');

function readConfig() {
  const defaultConfig = readJsonSafe(defaultPath, {});
  const legacyConfig = readJsonSafe(rootLegacyPath, {});
  const dataConfig = readJsonSafe(dataPath, {});

  // Merge order: default base -> legacy root override -> dynamic data override
  const merged = deepMerge(deepMerge(defaultConfig, legacyConfig), dataConfig);

  try {
    return validateConfig(merged);
  } catch {
    // If partial validation fails during runtime edit, return merged with best effort
    return merged;
  }
}

module.exports = { readConfig };