const fs = require('fs');
const path = require('path');

const crypto = require('crypto');
const { TextDecoder } = require('node:util');

function storeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function snapshot(filePath) {
  let stat;
  try { stat = fs.lstatSync(filePath); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw storeError('JSON_UNSAFE_PATH', 'JSON storage requires a regular file.');
  }
  // ENOENT after lstat is a concurrent change, not permission to initialize.
  return fs.readFileSync(filePath);
}

function parseJson(bytes) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    // Do not include raw contents (possibly credentials) in diagnostics.
    throw storeError('JSON_CORRUPT', 'JSON data is corrupt; validated recovery is required.');
  }
}

/** Missing file => fallback; empty, malformed, invalid UTF-8 or unreadable => throw.
 * No backup/temporary is automatically promoted. Valid JSON primitives remain
 * supported; business/schema validation belongs to the owning service.
 */
function readJsonSafe(filePath, fallback = {}) {
  const bytes = snapshot(filePath);
  return bytes === null ? fallback : parseJson(bytes);
}

// Explicit legacy compatibility for disposable, NON-critical display/cache data.
// It never grants permission to overwrite corrupt/unreadable files: all writes
// still use the strict publication checks below. Critical consumers must not use it.
function readJsonOrDefault(filePath, fallback = {}) {
  try { return readJsonSafe(filePath, fallback); }
  catch { return fallback; }
}

function assertUnchanged(filePath, before) {
  const current = snapshot(filePath);
  if (before === null ? current !== null : current === null || !current.equals(before)) {
    throw storeError('JSON_CONFLICT', 'JSON storage changed before publication.');
  }
}

function serialize(data) {
  const payload = JSON.stringify(data, null, 2);
  if (payload === undefined) throw storeError('JSON_INVALID_VALUE', 'Value cannot be stored as JSON.');
  return Buffer.from(payload, 'utf8');
}

function temporaryPath(filePath, kind) {
  return `${filePath}.${kind}-${process.pid}-${crypto.randomBytes(12).toString('hex')}`;
}

// Remove only the file we exclusively created, and only after its descriptor
// was closed. Never scan/delete another writer's or an interrupted run's files.
function removeOwnedTemporary(filePath, identity) {
  const stat = fs.lstatSync(filePath);
  if (stat.isFile() && !stat.isSymbolicLink() && stat.dev === identity.dev && stat.ino === identity.ino) {
    fs.unlinkSync(filePath);
  }
}

function writeExclusive(filePath, payload) {
  let fd;
  let identity;
  let closed = false;
  try {
    fd = fs.openSync(filePath, 'wx', 0o600);
    identity = fs.fstatSync(fd);
    fs.writeFileSync(fd, payload);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    closed = true;
    return identity;
  } catch (error) {
    if (fd !== undefined && !closed) {
      try { fs.closeSync(fd); closed = true; } catch {}
    }
    if (closed && identity) {
      try { removeOwnedTemporary(filePath, identity); }
      catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; }
    }
    throw error;
  }
}

function publish(filePath, payload, before) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpFile = temporaryPath(filePath, 'tmp');
  const identity = writeExclusive(tmpFile, payload);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      assertUnchanged(filePath, before);
      try {
        fs.renameSync(tmpFile, filePath);
        return filePath; // Publication point: no fallible persistence steps after it.
      } catch (error) {
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === 4) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
      }
    }
  } catch (error) {
    try { removeOwnedTemporary(tmpFile, identity); }
    catch (cleanupError) { if (cleanupError.code !== 'ENOENT') error.cleanupError = cleanupError; }
    throw error;
  }
}

/** Per-file publication only: fsync the temporary, close, then same-directory
 * rename. Any failure before successful rename leaves the original untouched.
 * No copy/truncate fallback; Windows sharing violations get bounded retries.
 * No directory fsync/power-loss guarantee, multi-file transaction or cross-process
 * lock is provided. Callers must coordinate competing read-modify-write cycles.
 */
function writeJsonAtomic(filePath, data) {
  const before = snapshot(filePath);
  if (before !== null) parseJson(before); // Blocks blind writes after a lenient read.
  return publish(filePath, serialize(data), before);
}

/** Explicit operator recovery, never automatic startup recovery.
 * expectedHash: SHA-256 of the inspected corrupt bytes, or null for absence.
 * validate: synchronous schema/business validator returning exactly true.
 * Healthy destinations cannot be rolled back. The corrupt original is retained
 * in a synced preservedPath even if publication fails. Backup stays untouched.
 * Run with other writers stopped/coordinated: the comparison is not an OS CAS.
 */
function recoverJsonFromBackup(filePath, backupPath, { expectedHash, validate } = {}) {
  if (typeof validate !== 'function' ||
      !(expectedHash === null || (typeof expectedHash === 'string' && /^[a-f0-9]{64}$/.test(expectedHash)))) {
    throw storeError('JSON_RECOVERY_INVALID', 'Recovery requires an expected revision and a validator.');
  }
  const before = snapshot(filePath);
  const revision = before === null ? null : crypto.createHash('sha256').update(before).digest('hex');
  if (revision !== expectedHash) throw storeError('JSON_CONFLICT', 'Recovery revision does not match.');
  if (before !== null) {
    let corrupt = false;
    try { parseJson(before); } catch (error) { corrupt = error.code === 'JSON_CORRUPT'; }
    if (!corrupt) throw storeError('JSON_RECOVERY_HEALTHY', 'Refusing to replace healthy JSON during recovery.');
  }
  const backup = snapshot(backupPath);
  if (backup === null) throw storeError('JSON_BACKUP_MISSING', 'Recovery backup does not exist.');
  const candidate = parseJson(backup);
  if (validate(candidate) !== true) throw storeError('JSON_RECOVERY_INVALID', 'Recovery backup failed validation.');
  const payload = serialize(candidate);
  assertUnchanged(filePath, before);
  let preservedPath = null;
  if (before !== null) {
    preservedPath = temporaryPath(filePath, 'corrupt');
    writeExclusive(preservedPath, before);
  }
  try { publish(filePath, payload, before); }
  catch (error) { error.preservedPath = preservedPath; throw error; }
  return { filePath, preservedPath };
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
  readJsonOrDefault,
  writeJsonAtomic,
  recoverJsonFromBackup,
  deepMerge
};
