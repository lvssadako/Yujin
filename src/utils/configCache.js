const path = require('path');
const { readJsonSafe, writeJsonAtomic, deepMerge } = require('./jsonStore');
const { validateConfig } = require('./config/loader');
const logger = require('./logger');

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

function writeConfig(updaterOrConfig) {
  const current = readConfig();
  let updated = typeof updaterOrConfig === 'function' ? updaterOrConfig(current) : updaterOrConfig;
  if (!updated || typeof updated !== 'object') updated = current;

  // Save to data/config.json (central data directory)
  writeJsonAtomic(dataPath, updated);
  // Also keep rootLegacyPath synced
  try {
    writeJsonAtomic(rootLegacyPath, updated);
  } catch (err) {
    logger.debug('[configCache] Could not sync root config.json:', err?.message);
  }

  return updated;
}

module.exports = {
  readConfig,
  writeConfig,
  defaultPath,
  rootLegacyPath,
  dataPath
};