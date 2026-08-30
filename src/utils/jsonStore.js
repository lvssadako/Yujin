const fs = require('fs');
const path = require('path');

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

const crypto = require('crypto');

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmpFile = `${filePath}.tmp-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const payload = JSON.stringify(data, null, 2);

  fs.writeFileSync(tmpFile, payload, 'utf8');
  fs.renameSync(tmpFile, filePath);
  return filePath;
}

function deepMerge(a, b) {
  if (!a) return b || {};
  if (!b) return a || {};

  const out = { ...a };

  for (const key of Object.keys(b)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const value = b[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      out[key] = deepMerge(a[key] || {}, value);
    } else {
      out[key] = value;
    }
  }

  return out;
}

module.exports = {
  readJsonSafe,
  writeJsonAtomic,
  deepMerge
};
