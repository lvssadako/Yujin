const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  loadCommandRegistry,
  reloadCommandRegistry,
  shouldTriggerHotReload,
  syncSlashCommands
} = require('../../loaders/commandLoader');
const projectRoot = path.join(__dirname, '..', '..');

test('loadCommandRegistry loads slash and prefix commands from the current project layout', () => {
  const registry = loadCommandRegistry({
    commandsDir: path.join(projectRoot, 'commands'),
    sharedDir: path.join(projectRoot, 'commands_shared'),
    prefixDir: path.join(projectRoot, 'prefixCommands')
  });

  assert.ok(registry.commands instanceof Map);
  assert.ok(registry.prefixCommands instanceof Map);
  assert.ok(Array.isArray(registry.commandData));
  assert.ok(registry.commandData.length > 0);
  assert.ok(registry.commands.has('help'));
  assert.ok(registry.commands.has('reload'));
  assert.ok(registry.commands.has('restart'));
  assert.ok(registry.prefixCommands.size > 0);
});

test('reloadCommandRegistry successfully refreshes commands on mock client', () => {
  const mockClient = {
    commands: new Map(),
    prefixCommands: new Map(),
    commandData: []
  };

  const registry = reloadCommandRegistry(mockClient, {
    commandsDir: path.join(projectRoot, 'commands'),
    sharedDir: path.join(projectRoot, 'commands_shared'),
    prefixDir: path.join(projectRoot, 'prefixCommands')
  });

  assert.ok(registry);
  assert.ok(mockClient.commands.has('reload'));
  assert.ok(mockClient.commands.has('restart'));
  assert.ok(mockClient.commands.has('streak'));
  assert.equal(mockClient.commands.size, registry.commands.size);
});

test('shouldTriggerHotReload correctly filters files', () => {
  // Valid JS files should trigger hot reload
  assert.equal(shouldTriggerHotReload('streak.js'), true);
  assert.equal(shouldTriggerHotReload('services/streakService.js'), true);
  assert.equal(shouldTriggerHotReload('utils/embedFactory.js'), true);

  // Non-JS files should NOT trigger
  assert.equal(shouldTriggerHotReload('economy.json'), false);
  assert.equal(shouldTriggerHotReload('README.md'), false);
  assert.equal(shouldTriggerHotReload('image.png'), false);

  // Test files should NOT trigger
  assert.equal(shouldTriggerHotReload('command-loader.test.js'), false);
  assert.equal(shouldTriggerHotReload('streak.spec.js'), false);
  assert.equal(shouldTriggerHotReload('__tests__/foo.js'), false);

  // Temporary / hidden / editor files should NOT trigger
  assert.equal(shouldTriggerHotReload('.commands_hash'), false);
  assert.equal(shouldTriggerHotReload('.swp'), false);
  assert.equal(shouldTriggerHotReload('file.js~'), false);
  assert.equal(shouldTriggerHotReload('~temp.js'), false);
  assert.equal(shouldTriggerHotReload('#backup.js'), false);
  assert.equal(shouldTriggerHotReload(null), false);
  assert.equal(shouldTriggerHotReload(''), false);
});

test('syncSlashCommands validates required credentials', async () => {
  const res = await syncSlashCommands({ token: null, clientId: null, guildId: null, commandData: [] });
  assert.equal(res.synced, false);
  assert.ok(res.error);
});


