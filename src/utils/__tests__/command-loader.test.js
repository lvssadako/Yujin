const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Import the loader without opening operational log transports.
const loggerPath = require.resolve('../logger');
const previousLogger = require.cache[loggerPath];
require.cache[loggerPath] = { exports: { info() {}, warn() {}, error() {} } };
const { getAllJsFiles, loadCommandRegistry, reloadCommandRegistry, shouldTriggerHotReload, syncSlashCommands } = require('../../loaders/commandLoader');
if (previousLogger) require.cache[loggerPath] = previousLogger;
else delete require.cache[loggerPath];

function makeFixtures(t) {
  const tempDir = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempDir, 'lcobot-command-loader-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), tempDir);
    assert.ok(path.basename(root).startsWith('lcobot-command-loader-'));
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(root + path.sep)) delete require.cache[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const paths = Object.fromEntries(['commands', 'shared', 'prefix', 'services', 'constants', 'utils'].map(name => {
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    return [name + 'Dir', dir];
  }));
  const write = (file, source) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  };
  const dual = (name, version) => `module.exports = {
    data: { name: '${name}', toJSON() { return { name: this.name }; } },
    aliases: ['${name}-alias'], execute() { return '${version}-slash'; },
    executePrefix() { return '${version}-prefix'; }
  };`;
  const commandFile = path.join(paths.commandsDir, 'nested', 'dual.js');
  write(commandFile, dual('dual', 'v1'));
  write(path.join(paths.commandsDir, 'contests', 'testbutton.js'), dual('testbutton', 'valid'));
  write(path.join(paths.sharedDir, 'shared.js'), `module.exports = {
    name: 'shared', data: { name: 'shared', toJSON() { return { name: this.name }; } },
    executeSlash() { return 'shared-slash'; }, executePrefix() { return 'shared-prefix'; }
  };`);
  write(path.join(paths.prefixDir, 'legacy.js'), `module.exports = {
    name: 'legacy', aliases: ['legacy-alias'], execute() { return 'legacy-prefix'; }
  };`);
  const marker = path.join(root, 'test-module-executed.txt');
  const excluded = [];
  for (const dir of [paths.commandsDir, paths.sharedDir, paths.prefixDir]) {
    for (const relative of ['bad.test.js', 'bad.spec.js', 'tests/helper.js', '__tests__/helper.js', 'nested/tests/helper.js', 'nested/__tests__/helper.js']) {
      const file = path.join(dir, relative);
      // Importing alone leaves evidence even if the loader catches an error.
      write(file, `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'imported');\n${dual('forbidden', 'forbidden')}`);
      excluded.push(file);
    }
  }
  return { paths, marker, excluded, commandFile, dual, write };
}

function assertRegistry(registry, version) {
  assert.deepEqual([...registry.commands.keys()].sort(), ['dual', 'shared', 'testbutton']);
  assert.deepEqual([...registry.prefixCommands.keys()].sort(), ['dual', 'dual-alias', 'legacy', 'legacy-alias', 'shared', 'testbutton', 'testbutton-alias']);
  assert.deepEqual(registry.commandData.map(cmd => cmd.name).sort(), ['dual', 'shared', 'testbutton']);
  assert.equal(registry.commands.get('dual').execute(), `${version}-slash`);
  assert.equal(registry.prefixCommands.get('dual-alias').executePrefix(), `${version}-prefix`);
  assert.equal(registry.commands.get('shared').execute(), 'shared-slash');
  assert.equal(registry.prefixCommands.get('shared').execute(), 'shared-prefix');
  assert.equal(registry.prefixCommands.get('legacy-alias').execute(), 'legacy-prefix');
}

function assertExcluded(fixture) {
  assert.equal(fs.existsSync(fixture.marker), false, 'test modules must never execute');
  for (const file of fixture.excluded) assert.equal(require.cache[file], undefined, `test module was imported: ${file}`);
}

test('initial discovery excludes test modules and preserves slash, shared, prefix and aliases', t => {
  const fixture = makeFixtures(t);
  assertRegistry(loadCommandRegistry(fixture.paths), 'v1');
  assertExcluded(fixture);
  assert.equal(getAllJsFiles(fixture.paths.commandsDir).length, 2);
  assert.deepEqual(getAllJsFiles(path.join(fixture.paths.commandsDir, 'tests')), []);
});

test('reload refreshes commands without importing tests or duplicating registrations', t => {
  const fixture = makeFixtures(t);
  const initial = loadCommandRegistry(fixture.paths);
  const client = { commands: initial.commands, prefixCommands: initial.prefixCommands };
  fixture.write(fixture.commandFile, fixture.dual('dual', 'v2'));
  for (let i = 0; i < 2; i++) {
    assertRegistry(reloadCommandRegistry(client, fixture.paths), 'v2');
    assertRegistry(client, 'v2');
    assertExcluded(fixture);
  }
});

test('prefix files retain precedence over dual prefix entries and aliases', t => {
  const fixture = makeFixtures(t);
  fixture.write(path.join(fixture.paths.prefixDir, 'override.js'), `module.exports = {
    name: 'dual', aliases: ['dual-alias'], executePrefix() { return 'override'; }
  };`);
  for (const registry of [loadCommandRegistry(fixture.paths), reloadCommandRegistry(null, fixture.paths)]) {
    assert.equal(registry.commands.get('dual').execute(), 'v1-slash');
    assert.equal(registry.prefixCommands.get('dual').executePrefix(), 'override');
    assert.equal(registry.prefixCommands.get('dual-alias').executePrefix(), 'override');
  }
  assertExcluded(fixture);
});

test('hot reload excludes test path segments with either path separator', () => {
  for (const filename of ['streak.js', 'services/streakService.js', 'utils/embedFactory.js', 'contests/testbutton.js']) {
    assert.equal(shouldTriggerHotReload(filename), true, filename);
  }
  for (const filename of ['economy.json', 'README.md', 'image.png', 'command-loader.test.js', 'streak.spec.js', '__tests__/foo.js', 'tests/foo.js', 'nested/tests/foo.js', 'nested/__tests__/foo.js', 'tests\\foo.js', 'nested\\__tests__\\foo.js', 'nested\\tests\\foo.js', '.commands_hash', '.swp', 'file.js~', '~temp.js', '#backup.js', null, '']) {
    assert.equal(shouldTriggerHotReload(filename), false, String(filename));
  }
});

test('slash sync rejects missing credentials without contacting Discord', async () => {
  const result = await syncSlashCommands({ token: null, clientId: null, guildId: null, commandData: [] });
  assert.equal(result.synced, false);
  assert.ok(result.error);
});
