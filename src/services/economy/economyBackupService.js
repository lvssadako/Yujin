const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { withLock } = require('./economyLock');
const payments = require('./loanPaymentStore');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const logger = require('../../utils/logger');

const defaultDir = path.join(__dirname, '../../../data');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function writeSnapshot(file, state) {
  // Immutable backup artifacts must preserve original revisions; they are not live managed wallets.
  const fd = fs.openSync(file, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(state, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

function createBackup({ dataDir = defaultDir, now = Date.now } = {}) {
  return withLock(dataDir, () => {
    if (!['economy.json', 'loans.json'].some(name => fs.existsSync(path.join(dataDir, name)))) return null;
    payments.recover(dataDir);
    const day = new Date(now()).toISOString().slice(0, 10);
    const parent = path.join(dataDir, 'backups');
    const destination = path.join(parent, 'economy-' + day);
    if (fs.existsSync(destination)) {
      const manifest = readJsonSafe(path.join(destination, 'manifest.json'), null);
      if (!manifest || manifest.version !== 1 || manifest.day !== day || !manifest.files) throw new Error('Invalid economic backup manifest');
      for (const name of ['economy.json', 'loans.json', 'loan-payments.json']) {
        const bytes = fs.readFileSync(path.join(destination, name));
        if (hash(bytes) !== manifest.files[name]) throw new Error('Economic backup checksum mismatch');
        JSON.parse(bytes.toString('utf8'));
      }
      return destination;
    }
    const fallbacks = { economy: { guilds: {} }, loans: { guilds: {} }, 'loan-payments': { version: 1, receipts: {}, pending: null } };
    const snapshot = Object.fromEntries(Object.entries(fallbacks).map(([name, fallback]) =>
      [name, readJsonSafe(path.join(dataDir, name + '.json'), fallback)]));
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const temporary = fs.mkdtempSync(path.join(parent, '.economy-'));
    try {
      const manifest = { version: 1, day, createdAt: new Date(now()).toISOString(), files: {} };
      for (const [name, state] of Object.entries(snapshot)) {
        const file = path.join(temporary, name + '.json');
        writeSnapshot(file, state);
        manifest.files[name + '.json'] = hash(fs.readFileSync(file));
      }
      writeJsonAtomic(path.join(temporary, 'manifest.json'), manifest);
      fs.renameSync(temporary, destination);
      return destination;
    } catch (error) {
      // Only this invocation's exclusively created temporary directory is removed.
      fs.rmSync(temporary, { recursive: true, force: true });
      throw error;
    }
  });
}

let timer = null;
function stopBackupScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}
function startBackupScheduler({ backup = createBackup, now = Date.now, schedule = setTimeout, cancel = clearTimeout } = {}) {
  stopBackupScheduler();
  let stopped = false, handle = null;
  function run() {
    if (stopped) return;
    try {
      const destination = backup();
      logger.info('Copia económica diaria verificada', { destination });
    } catch (error) {
      logger.error('Error en copia económica diaria', { error: error.message });
    } finally {
      if (!stopped) {
        const delay = 86400000 - (now() % 86400000) + 1000;
        handle = schedule(run, delay);
        handle?.unref?.();
        timer = handle;
      }
    }
  }
  run();
  return () => { stopped = true; if (handle) cancel(handle); if (timer === handle) timer = null; };
}
module.exports = { createBackup, startBackupScheduler, stopBackupScheduler };
