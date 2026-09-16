const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const store = require('../jsonStore');
const { readJsonSafe, readJsonOrDefault, writeJsonAtomic, recoverJsonFromBackup, deepMerge } = store;

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcobot-json-'));
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('lcobot-json-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const file = path.join(dir, 'store.json');
  return { dir, file, bytes: () => fs.readFileSync(file),
    names: () => fs.readdirSync(dir).sort() };
}
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const code = expected => error => error.code === expected;
const fail = name => Object.assign(new Error(`Injected ${name}`), { code: name });
const validateBalance = value => !!value && Number.isSafeInteger(value.coins) && value.coins >= 0;

test('only absence returns defaults, without creating any files', t => {
  const f = fixture(t);
  const fallback = { guilds: {} };
  assert.equal(readJsonSafe(f.file, fallback), fallback);
  assert.deepEqual(f.names(), []);
  writeJsonAtomic(f.file, fallback);
  assert.deepEqual(readJsonSafe(f.file), fallback);
});

test('corrupt, empty, whitespace and invalid UTF-8 stay byte-for-byte intact', t => {
  const f = fixture(t);
  for (const bytes of [Buffer.from('{invalid'), Buffer.alloc(0), Buffer.from(' \n'),
    Buffer.from('{"secret":"synthetic-token",'), Buffer.from([0x22, 0xc3, 0x28, 0x22])]) {
    fs.writeFileSync(f.file, bytes);
    assert.throws(() => readJsonSafe(f.file, { coins: 0 }), code('JSON_CORRUPT'));
    assert.throws(() => writeJsonAtomic(f.file, { coins: 0 }), code('JSON_CORRUPT'));
    assert.deepEqual(f.bytes(), bytes);
    assert.deepEqual(f.names(), ['store.json']);
    try { readJsonSafe(f.file); } catch (error) {
      assert.ok(!String(error.stack).includes('synthetic-token'));
      assert.equal(error.cause, undefined);
    }
  }
});

test('legacy fallback is explicit and cannot authorize a destructive write', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{bad');
  const fallback = { coins: 0 };
  assert.equal(readJsonOrDefault(f.file, fallback), fallback);
  assert.throws(() => writeJsonAtomic(f.file, fallback), code('JSON_CORRUPT'));
  assert.equal(f.bytes().toString(), '{bad');
  for (const value of [null, false, 42, 'hello', [], {}]) {
    fs.writeFileSync(f.file, JSON.stringify(value));
    assert.deepEqual(readJsonSafe(f.file, fallback), value);
  }
});

test('permission and IO errors do not masquerade as absence', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":20}');
  const before = f.bytes();
  for (const method of ['lstatSync', 'readFileSync']) {
    const original = fs[method];
    const mocked = t.mock.method(fs, method, function (file, ...args) {
      if (file === f.file) throw fail('EACCES');
      return original.call(this, file, ...args);
    });
    assert.throws(() => readJsonSafe(f.file), code('EACCES'));
    assert.throws(() => writeJsonAtomic(f.file, {}), code('EACCES'));
    mocked.mock.restore();
    assert.deepEqual(f.bytes(), before);
  }
  const mocked = t.mock.method(fs, 'readFileSync', () => { throw fail('ENOENT'); });
  assert.throws(() => readJsonSafe(f.file), code('ENOENT'));
  mocked.mock.restore();
  assert.deepEqual(f.names(), ['store.json']);
  assert.throws(() => readJsonSafe(f.dir), code('JSON_UNSAFE_PATH'));
});

test('writeJsonAtomic syncs and closes a unique temporary before atomic replacement', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"old":true}');
  const events = [];
  let temporaryFd;
  const original = Object.fromEntries(['openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync'].map(name => [name, fs[name]]));
  const mocks = Object.keys(original).map(name => t.mock.method(fs, name, function (...args) {
    if (name === 'openSync' && args[1] === 'r') return original[name].apply(this, args);
    if (['writeFileSync', 'fsyncSync', 'closeSync'].includes(name) && args[0] !== temporaryFd) {
      return original[name].apply(this, args);
    }
    events.push(name);
    if (name === 'openSync') { assert.equal(args[1], 'wx'); assert.equal(args[2], 0o600); }
    if (name === 'renameSync') {
      assert.equal(path.dirname(args[0]), f.dir);
      assert.deepEqual(readJsonSafe(args[0]), { ok: true, count: 2 });
    }
    const result = original[name].apply(this, args);
    if (name === 'openSync') temporaryFd = result;
    if (name === 'closeSync') temporaryFd = undefined;
    return result;
  }));
  assert.equal(writeJsonAtomic(f.file, { ok: true, count: 2 }), f.file);
  mocks.forEach(mock => mock.mock.restore());
  assert.deepEqual(events, ['openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync']);
  assert.deepEqual(readJsonSafe(f.file), { ok: true, count: 2 });
  assert.deepEqual(f.names(), ['store.json']);
});

for (const step of ['openSync', 'writeFileSync', 'fsyncSync', 'closeSync', 'renameSync']) {
  test(`failure at ${step} preserves old JSON and safely cleans own temporary`, t => {
    const f = fixture(t);
    const before = Buffer.from('{"coins":100,"otherUser":9}');
    fs.writeFileSync(f.file, before);
    const original = fs[step];
    const open = fs.openSync;
    let temporaryFd;
    const opening = step === 'closeSync' ? t.mock.method(fs, 'openSync', (...args) => {
      const fd = open(...args);
      if (args[1] === 'wx') temporaryFd = fd;
      return fd;
    }) : null;
    let calls = 0;
    const mocked = t.mock.method(fs, step, function (...args) {
      if (step === 'openSync' && args[1] !== 'wx') return original.apply(this, args);
      if (step === 'closeSync' && args[0] !== temporaryFd) return original.apply(this, args);
      if (step === 'closeSync' && calls++ > 0) return original.apply(this, args);
      if (step === 'writeFileSync') original.call(this, args[0], '{partial');
      throw fail('EIO');
    });
    assert.throws(() => writeJsonAtomic(f.file, { coins: 20 }), code('EIO'));
    mocked.mock.restore();
    opening?.mock.restore();
    assert.deepEqual(f.bytes(), before);
    assert.deepEqual(f.names(), ['store.json']);
  });
}

test('failed first write leaves destination absent', t => {
  const f = fixture(t);
  const mocked = t.mock.method(fs, 'fsyncSync', () => { throw fail('EIO'); });
  assert.throws(() => writeJsonAtomic(f.file, {}), code('EIO'));
  mocked.mock.restore();
  assert.deepEqual(f.names(), []);
});

test('rename errors never invoke copyFileSync; Windows retries are bounded', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const before = f.bytes();
  const copied = t.mock.method(fs, 'copyFileSync', () => assert.fail('Copy fallback forbidden'));
  for (const errorCode of ['EPERM', 'EBUSY', 'EACCES', 'EXDEV', 'EIO']) {
    const renamed = t.mock.method(fs, 'renameSync', () => { throw fail(errorCode); });
    assert.throws(() => writeJsonAtomic(f.file, { coins: 50 }), code(errorCode));
    assert.equal(renamed.mock.callCount(), ['EPERM', 'EBUSY', 'EACCES'].includes(errorCode) ? 5 : 1);
    renamed.mock.restore();
    assert.deepEqual(f.bytes(), before);
    assert.deepEqual(f.names(), ['store.json']);
  }
  assert.equal(copied.mock.callCount(), 0);
});

test('a transient Windows sharing violation retries the same validated temporary', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const original = fs.renameSync;
  const paths = [];
  const mocked = t.mock.method(fs, 'renameSync', (source, dest) => {
    paths.push(source);
    if (paths.length < 3) throw fail('EPERM');
    return original(source, dest);
  });
  writeJsonAtomic(f.file, { coins: 50 });
  mocked.mock.restore();
  assert.equal(new Set(paths).size, 1);
  assert.deepEqual(readJsonSafe(f.file), { coins: 50 });
});

test('exclusive creation collision does not truncate or delete another temporary', t => {
  const f = fixture(t);
  const suffix = Buffer.alloc(12, 1);
  const other = `${f.file}.tmp-${process.pid}-${suffix.toString('hex')}`;
  fs.writeFileSync(other, 'owned by another operation');
  const mocked = t.mock.method(crypto, 'randomBytes', () => suffix);
  assert.throws(() => writeJsonAtomic(f.file, {}), code('EEXIST'));
  mocked.mock.restore();
  assert.equal(fs.readFileSync(other, 'utf8'), 'owned by another operation');
  assert.equal(fs.existsSync(f.file), false);
});

test('cleanup failure is reported without masking the original error or deleting other files', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const unrelated = `${f.file}.tmp-abandoned`;
  fs.writeFileSync(unrelated, '{"coins":999}');
  const renamed = t.mock.method(fs, 'renameSync', () => { throw fail('EXDEV'); });
  const unlinked = t.mock.method(fs, 'unlinkSync', () => { throw fail('EBUSY'); });
  assert.throws(() => writeJsonAtomic(f.file, { coins: 50 }), error =>
    error.code === 'EXDEV' && error.cleanupError.code === 'EBUSY');
  renamed.mock.restore(); unlinked.mock.restore();
  assert.deepEqual(readJsonSafe(f.file), { coins: 100 });
  assert.ok(fs.existsSync(unrelated));
  assert.equal(f.names().length, 3);
});

test('invalid serialization leaves the destination and directory untouched', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const circular = {}; circular.self = circular;
  for (const invalid of [undefined, () => {}, circular, 1n]) {
    assert.throws(() => writeJsonAtomic(f.file, invalid));
    assert.deepEqual(readJsonSafe(f.file), { coins: 100 });
    assert.deepEqual(f.names(), ['store.json']);
  }
});

test('a changed destination during write blocks publication and preserves the newer bytes', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  for (const replacement of ['{"coins":75}', '{corrupted-by-another-writer']) {
    fs.writeFileSync(f.file, '{"coins":100}');
    const original = fs.fsyncSync;
    const mocked = t.mock.method(fs, 'fsyncSync', fd => {
      original(fd); fs.writeFileSync(f.file, replacement);
    });
    assert.throws(() => writeJsonAtomic(f.file, { coins: 50 }), code('JSON_CONFLICT'));
    mocked.mock.restore();
    assert.equal(f.bytes().toString(), replacement);
    assert.deepEqual(f.names(), ['store.json']);
  }
});

test('a real process crash leaves an inert temporary; restart never auto-promotes it', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const modulePath = require.resolve('../jsonStore');
  const crashed = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const { writeJsonAtomic } = require(process.argv[1]);
    fs.renameSync = () => process.exit(71);
    writeJsonAtomic(process.argv[2], { coins: 50 });
  `, modulePath, f.file], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.ifError(crashed.error); assert.equal(crashed.status, 71, crashed.stderr);
  const orphan = f.names().find(name => name.includes('.tmp-'));
  assert.ok(orphan);
  const restarted = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const store = require(process.argv[1]);
    assert.equal(store.readJsonSafe(process.argv[2]).coins, 100);
    store.writeJsonAtomic(process.argv[2], { coins: 80 });
  `, modulePath, f.file], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.ifError(restarted.error); assert.equal(restarted.status, 0, restarted.stderr);
  assert.deepEqual(readJsonSafe(f.file), { coins: 80 });
  assert.deepEqual(readJsonSafe(path.join(f.dir, orphan)), { coins: 50 });
  fs.unlinkSync(f.file);
  assert.deepEqual(readJsonSafe(f.file, {}), {});
});

test('recovery requires matching revision and explicit valid backup; it preserves corrupt evidence', t => {
  const f = fixture(t);
  const damaged = Buffer.from('{damaged');
  fs.writeFileSync(f.file, damaged);
  const backup = path.join(f.dir, 'backup.json');
  fs.writeFileSync(backup, '{"coins":100}');
  const expectedHash = hash(damaged);
  assert.throws(() => recoverJsonFromBackup(f.file, backup), code('JSON_RECOVERY_INVALID'));
  assert.throws(() => recoverJsonFromBackup(f.file, backup, { expectedHash: '0'.repeat(64), validate: validateBalance }), code('JSON_CONFLICT'));
  const result = recoverJsonFromBackup(f.file, backup, { expectedHash, validate: validateBalance });
  assert.deepEqual(readJsonSafe(f.file), { coins: 100 });
  assert.deepEqual(fs.readFileSync(result.preservedPath), damaged);
  assert.equal(fs.readFileSync(backup, 'utf8'), '{"coins":100}');
  assert.throws(() => recoverJsonFromBackup(f.file, backup, {
    expectedHash: hash(f.bytes()), validate: validateBalance,
  }), code('JSON_RECOVERY_HEALTHY'));
});

test('invalid, missing, schema-incompatible or asynchronously validated backups cannot recover', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{damaged');
  const backup = path.join(f.dir, 'backup.json');
  const options = { expectedHash: hash(f.bytes()), validate: validateBalance };
  assert.throws(() => recoverJsonFromBackup(f.file, backup, options), code('JSON_BACKUP_MISSING'));
  for (const bytes of ['{invalid', '{"coins":-1}', 'null', '{}']) {
    fs.writeFileSync(backup, bytes);
    assert.throws(() => recoverJsonFromBackup(f.file, backup, options));
    assert.equal(f.bytes().toString(), '{damaged');
    assert.deepEqual(f.names(), ['backup.json', 'store.json']);
  }
  fs.writeFileSync(backup, '{"coins":100}');
  assert.throws(() => recoverJsonFromBackup(f.file, backup, { ...options, validate: async () => true }), code('JSON_RECOVERY_INVALID'));
});

test('failed recovery publication leaves corrupt destination and durable evidence intact', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{damaged');
  const backup = path.join(f.dir, 'backup.json');
  fs.writeFileSync(backup, '{"coins":100}');
  const mocked = t.mock.method(fs, 'renameSync', () => { throw fail('EIO'); });
  assert.throws(() => recoverJsonFromBackup(f.file, backup, {
    expectedHash: hash(f.bytes()), validate: validateBalance,
  }), error => {
    assert.equal(error.code, 'EIO');
    assert.equal(fs.readFileSync(error.preservedPath, 'utf8'), '{damaged');
    return true;
  });
  mocked.mock.restore();
  assert.equal(f.bytes().toString(), '{damaged');
  assert.equal(f.names().filter(name => name.includes('.tmp-')).length, 0);
});

test('missing destination can be explicitly recovered, but a concurrent change cannot', t => {
  const f = fixture(t);
  const backup = path.join(f.dir, 'backup.json');
  fs.writeFileSync(backup, '{"coins":100}');
  const result = recoverJsonFromBackup(f.file, backup, { expectedHash: null, validate: validateBalance });
  assert.equal(result.preservedPath, null);
  fs.writeFileSync(f.file, '{damaged');
  assert.throws(() => recoverJsonFromBackup(f.file, backup, {
    expectedHash: hash(f.bytes()), validate(value) {
      fs.writeFileSync(f.file, '{"coins":150}'); return validateBalance(value);
    },
  }), code('JSON_CONFLICT'));
  assert.deepEqual(readJsonSafe(f.file), { coins: 150 });
});

test('failure syncing the corruption evidence prevents recovery publication', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{damaged');
  const backup = path.join(f.dir, 'backup.json');
  fs.writeFileSync(backup, '{"coins":100}');
  const mocked = t.mock.method(fs, 'fsyncSync', () => { throw fail('EIO'); });
  assert.throws(() => recoverJsonFromBackup(f.file, backup, {
    expectedHash: hash(f.bytes()), validate: validateBalance,
  }), code('EIO'));
  mocked.mock.restore();
  assert.equal(f.bytes().toString(), '{damaged');
  assert.deepEqual(f.names(), ['backup.json', 'store.json']);
});

test('temporary is retained if its descriptor cannot be safely closed', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const open = fs.openSync;
  let temporaryFd;
  const opening = t.mock.method(fs, 'openSync', (...args) => {
    const fd = open(...args);
    if (args[1] === 'wx') temporaryFd = fd;
    return fd;
  });
  const close = fs.closeSync;
  const closing = t.mock.method(fs, 'closeSync', fd => {
    if (fd === temporaryFd) throw fail('EIO');
    return close(fd);
  });
  try {
    assert.throws(() => writeJsonAtomic(f.file, { coins: 50 }), code('EIO'));
    assert.equal(f.names().filter(name => name.includes('.tmp-')).length, 1);
  } finally {
    opening.mock.restore(); closing.mock.restore();
    if (temporaryFd !== undefined) close(temporaryFd);
  }
  assert.deepEqual(readJsonSafe(f.file), { coins: 100 });
});

test('process termination after rename retains the complete new JSON without a temporary', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"coins":100}');
  const run = spawnSync(process.execPath, ['-e', `
    const fs = require('node:fs');
    const store = require(process.argv[1]);
    const rename = fs.renameSync;
    fs.renameSync = (...args) => { rename(...args); process.exit(72); };
    store.writeJsonAtomic(process.argv[2], { coins: 50 });
  `, require.resolve('../jsonStore'), f.file], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.ifError(run.error); assert.equal(run.status, 72, run.stderr);
  assert.deepEqual(readJsonSafe(f.file), { coins: 50 });
  assert.deepEqual(f.names(), ['store.json']);
});

// Load only committed-branch consumer source, with synthetic data paths and a
// no-op logger. No imports of the bot entry point, Discord or operational data.
function consumer(relative, root, cache = new Map()) {
  if (cache.has(relative)) return cache.get(relative);
  const project = path.resolve(__dirname, '../../..');
  const sourceFile = path.join(project, relative);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(sourceFile, 'utf8'), {
    module, __dirname: path.dirname(path.join(root, relative)), Buffer, Date,
    require(id) {
      if (id.endsWith('/jsonStore')) return store;
      if (id.endsWith('/logger')) return { info() {}, warn() {}, error() {} };
      if (['fs', 'node:fs', 'path', 'node:path'].includes(id)) return require(id);
      if (id.startsWith('.')) {
        const next = path.posix.normalize(path.posix.join(path.posix.dirname(relative), id));
        return consumer(next.endsWith('.js') ? next : next + '.js', root, cache);
      }
      throw new Error(`Unexpected consumer dependency ${id}`);
    },
  }, { filename: sourceFile });
  cache.set(relative, module.exports);
  return module.exports;
}

test('critical consumers reject corruption before changing balances, loans, profiles or XP', t => {
  for (const [relative, filename, operation] of [
    ['src/services/economy/index.js', 'economy.json', c => c.economyService.addCoins('g', 'u', 50)],
    ['src/utils/economy.js', 'economy.json', c => c.addCoins('g', 'u', 50)],
    ['src/services/economy/loanService.js', 'loans.json', c => c.takeLoan('g', 'u', 1000)],
    ['src/utils/profileStore.js', 'profile.json', c => c.writeProfiles({ users: {} })],
    ['src/utils/levelStore.js', 'levels.json', c => c.addVoiceTime('g', 'u', 100)],
    ['src/services/level/index.js', 'levels.json', c => c.levelService.addVoiceTime('g', 'u', 100)],
  ]) {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.dir, 'data'));
    const dataFile = path.join(f.dir, 'data', filename);
    fs.writeFileSync(dataFile, '{damaged');
    const c = consumer(relative, f.dir);
    assert.throws(() => operation(c), code('JSON_CORRUPT'), relative);
    assert.equal(fs.readFileSync(dataFile, 'utf8'), '{damaged');
    assert.deepEqual(fs.readdirSync(path.dirname(dataFile)), [filename]);
  }
});

test('both level writers propagate persistence failures instead of reporting success', t => {
  for (const relative of ['src/utils/levelStore.js', 'src/services/level/index.js']) {
    const f = fixture(t);
    const loaded = consumer(relative, f.dir);
    const c = loaded.levelService || loaded;
    const mocked = t.mock.method(fs, 'fsyncSync', () => { throw fail('EIO'); });
    assert.throws(() => c.writeLevels({ guilds: {} }), code('EIO'));
    mocked.mock.restore();
    assert.equal(fs.existsSync(path.join(f.dir, 'data/levels.json')), false);
  }
});

test('economic operations keep valid balances and the existing loan interest rules', t => {
  const f = fixture(t);
  const economy = consumer('src/services/economy/index.js', f.dir).economyService;
  economy.addCoins('g1', 'u', 100);
  economy.addCoins('g2', 'u', 900);
  assert.equal(economy.removeCoins('g1', 'u', 40), true);
  assert.equal(economy.getBalance('g1', 'u').coins, 60);
  assert.equal(economy.getBalance('g2', 'u').coins, 900);
  const loans = consumer('src/services/economy/loanService.js', f.dir);
  assert.equal(loans.TICK_INTERVAL_MS, 24 * 60 * 60 * 1000);
  assert.equal(loans.MAX_DEBT_MULTIPLIER, 2.5);
  assert.equal(loans.takeLoan('g1', 'u', 1000).success, true);
  assert.equal(loans.getUserLoanSummary('g1', 'u').balance, 1050);
});

test('deepMerge keeps nested data consistent', () => {
  const merged = deepMerge({ config: { a: 1, nested: { x: 1 } } }, { config: { b: 2, nested: { y: 2 } } });

  assert.deepEqual(merged, {
    config: {
      a: 1,
      b: 2,
      nested: { x: 1, y: 2 }
    }
  });
});
