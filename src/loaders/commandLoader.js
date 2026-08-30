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

function loadCommandRegistry({
  commandsDir,
  sharedDir,
  prefixDir
}) {
  const commands = new Map();
  const prefixCommands = new Map();
  const commandData = [];

  const slashFiles = getAllJsFiles(commandsDir);
  for (const filePath of slashFiles) {
    try {
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

module.exports = { getAllJsFiles, loadCommandRegistry };
