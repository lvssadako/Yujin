const fs = require('fs');
const path = require('path');

const rootPath = path.join(__dirname, '..', 'config.json');
const dataPath = path.join(__dirname, '..', 'data', 'config.json');

function readJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function deepMerge(a, b) {
  if (!a) return b || {};
  if (!b) return a || {};
  const out = { ...a };
  for (const k of Object.keys(b)) {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
      out[k] = deepMerge(a[k] || {}, b[k]);
    } else {
      out[k] = b[k];
    }
  }
  return out;
}

function readConfig() {
  const base = readJson(rootPath) || {};
  const override = readJson(dataPath) || {};
  const merged = deepMerge(base, override);
  return merged;
}

module.exports = { readConfig };