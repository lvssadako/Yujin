const fs = require('node:fs');
const path = require('node:path');
const logger = require('../utils/logger');

function getAllJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function purgeFileCache(filePath) {
  try {
    const resolved = require.resolve(filePath);
    delete require.cache[resolved];
  } catch {}
}

function loadCommandRegistry({
  commandsDir,
  sharedDir,
  prefixDir,
  purgeCache = false
}) {
  const commands = new Map();
  const prefixCommands = new Map();
  const commandData = [];

  const slashFiles = getAllJsFiles(commandsDir);
  for (const filePath of slashFiles) {
    try {
      if (purgeCache) purgeFileCache(filePath);
      let cmd = require(filePath);
      if (typeof cmd === 'function' && cmd.prototype && cmd.prototype.execute) {
        cmd = new cmd();
      }
      if (cmd && cmd.data && (cmd.execute || typeof cmd.executeWithErrorHandling === 'function')) {
        const executeFn = typeof cmd.executeWithErrorHandling === 'function' ? cmd.executeWithErrorHandling.bind(cmd) : cmd.execute.bind(cmd);
        commands.set(cmd.data.name, { ...cmd, execute: executeFn });
        commandData.push(cmd.data.toJSON());
        if (typeof cmd.executePrefix === 'function') {
          prefixCommands.set(cmd.data.name, cmd);
        }
      }
    } catch (error) {
      logger.warn('Could not load command file', {
        filePath,
        error: error.message
      });
    }
  }

  if (sharedDir && fs.existsSync(sharedDir)) {
    const sharedFiles = fs.readdirSync(sharedDir).filter(file => file.endsWith('.js'));
    for (const file of sharedFiles) {
      const filePath = path.join(sharedDir, file);
      try {
        if (purgeCache) purgeFileCache(filePath);
        const cmd = require(filePath);
        if (cmd && cmd.data && cmd.executeSlash && cmd.name && cmd.executePrefix) {
          commands.set(cmd.data.name, {
            data: cmd.data,
            execute: cmd.executeSlash
          });
          commandData.push(cmd.data.toJSON());
          prefixCommands.set(cmd.name, { execute: cmd.executePrefix });
        }
      } catch (error) {
        logger.warn('Could not load shared command file', {
          filePath,
          error: error.message
        });
      }
    }
  }

  if (prefixDir && fs.existsSync(prefixDir)) {
    const prefixFiles = fs.readdirSync(prefixDir).filter(file => file.endsWith('.js'));
    for (const file of prefixFiles) {
      const filePath = path.join(prefixDir, file);
      try {
        if (purgeCache) purgeFileCache(filePath);
        const cmd = require(filePath);
        if (cmd && cmd.name && cmd.execute) {
          prefixCommands.set(cmd.name, cmd);
        }
      } catch (error) {
        logger.warn('Could not load prefix command file', {
          filePath,
          error: error.message
        });
      }
    }
  }

  return { commands, prefixCommands, commandData };
}

function reloadCommandRegistry(client, paths = {}) {
  const commandsDir = paths.commandsDir || path.join(__dirname, '..', 'commands');
  const sharedDir = paths.sharedDir || path.join(__dirname, '..', 'commands_shared');
  const prefixDir = paths.prefixDir || path.join(__dirname, '..', 'prefixCommands');

  const registry = loadCommandRegistry({
    commandsDir,
    sharedDir,
    prefixDir,
    purgeCache: true
  });

  if (client) {
    client.commands.clear();
    client.prefixCommands.clear();

    for (const [name, cmd] of registry.commands.entries()) {
      client.commands.set(name, cmd);
    }
    for (const [name, cmd] of registry.prefixCommands.entries()) {
      client.prefixCommands.set(name, cmd);
    }
    client.commandData = registry.commandData;
  }

  return registry;
}

function enableCommandWatcher(client, paths = {}) {
  const commandsDir = paths.commandsDir || path.join(__dirname, '..', 'commands');
  const prefixDir = paths.prefixDir || path.join(__dirname, '..', 'prefixCommands');
  const sharedDir = paths.sharedDir || path.join(__dirname, '..', 'commands_shared');

  const watchDirs = [commandsDir, prefixDir, sharedDir].filter(d => fs.existsSync(d));
  let reloadTimeout = null;

  for (const dir of watchDirs) {
    try {
      fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!filename || (!filename.endsWith('.js') && !filename.endsWith('.json'))) return;

        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => {
          try {
            const registry = reloadCommandRegistry(client, paths);
            logger.info('[HotReload] Comandos recargados automáticamente tras detectar cambios', {
              changedFile: filename,
              commandsCount: registry.commands.size,
              prefixCount: registry.prefixCommands.size
            });
          } catch (err) {
            logger.error('[HotReload] Error al autorecargar comandos', { error: err.message });
          }
        }, 300);
      });
    } catch (err) {
      logger.warn('[HotReload] No se pudo inicializar watcher en directorio', { dir, error: err.message });
    }
  }

  logger.info('[HotReload] Watcher de comandos activo en tiempo real.');
}

module.exports = {
  getAllJsFiles,
  loadCommandRegistry,
  reloadCommandRegistry,
  enableCommandWatcher
};

