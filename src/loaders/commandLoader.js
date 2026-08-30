const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { REST, Routes } = require('discord.js');
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

function purgeDirectoryCache(dir) {
  if (!fs.existsSync(dir)) return;
  const files = getAllJsFiles(dir);
  for (const f of files) {
    purgeFileCache(f);
  }
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
  const servicesDir = paths.servicesDir || path.join(__dirname, '..', 'services');
  const constantsDir = paths.constantsDir || path.join(__dirname, '..', 'constants');
  const utilsDir = paths.utilsDir || path.join(__dirname, '..', 'utils');

  // Purge dependencies cache so commands pick up new services/constants
  purgeDirectoryCache(servicesDir);
  purgeDirectoryCache(constantsDir);
  purgeDirectoryCache(utilsDir);

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

async function syncSlashCommands({ token, clientId, guildId, commandData, force = false }) {
  if (!token || !clientId || !guildId || !Array.isArray(commandData)) {
    return { synced: false, error: 'Missing credentials or commandData' };
  }

  const hashFile = path.join(__dirname, '..', 'data', '.commands_hash');
  const currentHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(commandData))
    .digest('hex');

  let cachedHash = '';
  try {
    if (fs.existsSync(hashFile)) {
      cachedHash = fs.readFileSync(hashFile, 'utf8').trim();
    }
  } catch {}

  if (!force && cachedHash === currentHash) {
    logger.info('[SlashSync] Estructura de comandos sin cambios. Sincronización con Discord omitida para evitar rate limits.', { count: commandData.length });
    return { synced: false, reason: 'unchanged', count: commandData.length };
  }

  try {
    logger.info('[SlashSync] Sincronizando comandos slash con Discord API...', { count: commandData.length, force });
    const rest = new REST({ version: '10' }).setToken(token);

    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commandData });

    try {
      const dataDir = path.dirname(hashFile);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(hashFile, currentHash, 'utf8');
    } catch {}

    logger.info('[SlashSync] Comandos slash registrados en Discord con éxito.', { count: commandData.length });
    return { synced: true, count: commandData.length };
  } catch (error) {
    logger.error('[SlashSync] Error registrando comandos en Discord', { error: error.message, stack: error.stack });
    return { synced: false, error: error.message };
  }
}

function shouldTriggerHotReload(filename) {
  if (!filename || typeof filename !== 'string') return false;

  // Only watch javascript files
  if (!filename.endsWith('.js')) return false;

  // Ignore test files and test suites
  if (filename.endsWith('.test.js') || filename.endsWith('.spec.js') || filename.includes('__tests__')) {
    return false;
  }

  // Ignore temporary / editor swap / lock / hidden files
  const base = path.basename(filename);
  if (base.startsWith('.') || base.startsWith('~') || base.startsWith('#') || base.endsWith('~') || base.endsWith('.swp')) {
    return false;
  }

  return true;
}

const activeWatchers = [];

function enableCommandWatcher(client, options = {}) {
  disableCommandWatcher();

  const commandsDir = options.commandsDir || path.join(__dirname, '..', 'commands');
  const prefixDir = options.prefixDir || path.join(__dirname, '..', 'prefixCommands');
  const sharedDir = options.sharedDir || path.join(__dirname, '..', 'commands_shared');
  const servicesDir = options.servicesDir || path.join(__dirname, '..', 'services');
  const constantsDir = options.constantsDir || path.join(__dirname, '..', 'constants');
  const utilsDir = options.utilsDir || path.join(__dirname, '..', 'utils');

  const token = options.token || process.env.TOKEN;
  const clientId = options.clientId || process.env.CLIENT_ID;
  const guildId = options.guildId || process.env.GUILD_ID;

  const watchDirs = [commandsDir, prefixDir, sharedDir, servicesDir, constantsDir, utilsDir].filter(d => fs.existsSync(d));
  let reloadTimeout = null;

  for (const dir of watchDirs) {
    try {
      const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
        if (!shouldTriggerHotReload(filename)) return;

        if (reloadTimeout) clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(async () => {
          try {
            const registry = reloadCommandRegistry(client, {
              commandsDir,
              prefixDir,
              sharedDir,
              servicesDir,
              constantsDir,
              utilsDir
            });

            logger.info('[HotReload] Código recargado automáticamente en caliente (sin reiniciar proceso)', {
              changedFile: filename,
              commandsCount: registry.commands.size,
              prefixCount: registry.prefixCommands.size
            });

            if (token && clientId && guildId && registry.commandData) {
              await syncSlashCommands({
                token,
                clientId,
                guildId,
                commandData: registry.commandData,
                force: false
              });
            }
          } catch (err) {
            logger.error('[HotReload] Error al autorecargar código en caliente', { error: err.message, stack: err.stack });
          }
        }, 350);
      });
      activeWatchers.push(watcher);
    } catch (err) {
      logger.warn('[HotReload] No se pudo inicializar watcher en directorio', { dir, error: err.message });
    }
  }

  logger.info('[HotReload] Watcher en tiempo real activo para comandos, servicios, constantes y utilidades (Hot Reload sin reinicio de bot).');
}

function disableCommandWatcher() {
  while (activeWatchers.length > 0) {
    const watcher = activeWatchers.pop();
    try {
      watcher.close();
    } catch {}
  }
}

module.exports = {
  getAllJsFiles,
  shouldTriggerHotReload,
  loadCommandRegistry,
  reloadCommandRegistry,
  enableCommandWatcher,
  disableCommandWatcher,
  syncSlashCommands
};



