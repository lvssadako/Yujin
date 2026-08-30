const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadCommandRegistry } = require('../src/loaders/commandLoader');
const projectRoot = path.join(__dirname, '..');

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
  assert.ok(registry.prefixCommands.size > 0);
});
