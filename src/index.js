// index.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');
const logger = require('./utils/logger');

// Global error handlers
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: reason instanceof Error ? reason.message : reason, stack: reason instanceof Error ? reason.stack : undefined });
});
const { Client, Collection, GatewayIntentBits, REST, Routes, Events } = require('discord.js');
const { loadAndValidateConfig } = require('./utils/config/loader');
const { scheduleShopRotation } = require('./utils/badgeShop');
const { readProfiles, writeProfiles } = require('./utils/profileStore');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  logger.error('Falta TOKEN, CLIENT_ID o GUILD_ID en .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences
  ],
});

client.commands = new Collection();
client.slashCommands = new Collection();
client.prefixCommands = new Collection();

const { loadCommandRegistry } = require('./loaders/commandLoader');
const registry = loadCommandRegistry({
  commandsDir: path.join(__dirname, 'commands'),
  sharedDir: path.join(__dirname, 'commands_shared'),
  prefixDir: path.join(__dirname, 'prefixCommands')
});

for (const [name, cmd] of registry.commands.entries()) {
  client.commands.set(name, cmd);
}
for (const [name, cmd] of registry.prefixCommands.entries()) {
  client.prefixCommands.set(name, cmd);
}
const commandData = registry.commandData;

// Registrar comandos cuando el bot esté listo
client.once(Events.ClientReady, async () => {
  // Programar rotación de tienda
  scheduleShopRotation(() => {
    const profiles = readProfiles();
    return profiles.badges || {};
  });
  logger.info('Bot listo', { tag: client.user.tag });

  // Backup diario de economía
  try {
    require('./tools/economyBackupDaily').backupEconomyDaily();
    logger.info('Backup diario de economía ejecutado');
  } catch (err) {
    logger.error('Error en backup diario de economía', { error: err.message, stack: err.stack });
  }

  try {
    logger.info('Registrando comandos slash');
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    // BORRAR comandos globales previos
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    logger.info('Comandos globales eliminados');

    // REGISTRAR en guild (instantáneo)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandData });
    logger.info('Comandos registrados en guild', { count: commandData.length });
  } catch (error) {
    logger.error('Error registrando comandos', { error: error.message, stack: error.stack });
  }
});


// Cargar handler de interacciones (¡PROFESIONAL!)
require('./events/interactionCreate')(client);
require('./events/messageCreate')(client);
// Cargar sistemas de Seguridad y Auditoría
try {
  require('./events/messageCreate_automod')(client);
  require('./events/messageDelete_audit')(client);
  require('./events/messageUpdate_audit')(client);
  logger.info('Sistemas Automod y Audit cargados.');
} catch (e) {
  logger.error('Error cargando sistemas de seguridad', { error: e.message });
}
// Cargar y reprogramar timers de bump pendientes
require('./events/bumpTimersLoader')(client);
require('./services/giveaways/giveawayManager').init(client);

// Prefijo de comandos
const PREFIX = '&';

// Escuchar mensajes con prefijo
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

const command = client.prefixCommands.get(commandName);
if (!command) {
  logger.warn('Comando prefix no encontrado', { commandName });
  return;
}

logger.info('Prefix usado', { commandName, userTag: message.author.tag });
try {
  if (typeof command.executePrefix === 'function') {
    await command.executePrefix(message, args, client);
  } else if (typeof command.execute === 'function') {
    await command.execute(message, args, client);
  } else {
    await message.reply('❌ Este comando no tiene función ejecutable.');
  }
  logger.info('Comando prefix ejecutado correctamente', { commandName });
} catch (err) {
  logger.error('Error ejecutando comando prefix', { commandName, error: err.message, stack: err.stack });
  await message.reply('❌ Ocurrió un error al ejecutar este comando.');
}
});

// Cargar evento guildMemberUpdate
const eventFile = path.join(__dirname, 'events', 'guildMemberUpdate.js');
if (fs.existsSync(eventFile)) {
  const handler = require(eventFile);
  if (handler && typeof handler === 'function') handler(client);
}

// Forzar carga del config
logger.info('Cargando configuración');
const initialConfig = loadAndValidateConfig(path.join(__dirname, '..', 'config', 'default.json'));
logger.info('Config cargado', { roleBonusCount: Object.keys(initialConfig.roleXpBonuses || {}).length });

// Cargar eventos de niveles
const levelEvents = [
  './events/messageCreate_levels.js',
  './events/messageReactionAdd_levels.js',
  './events/voiceStateUpdate_levels.js'
];

for (const file of levelEvents) {
  try {
    const eventLoader = require(file);
    eventLoader(client);
    logger.info('Evento cargado', { file });
  } catch (err) {
    logger.error('Error cargando evento', { file, error: err.message, stack: err.stack });
  }
}

// Evento de status/roles
try {
  require('./events/presenceStatusRoles')(client);
  logger.info('Evento de status/roles cargado');
} catch (e) {
  logger.error('Error cargando presenceStatusRoles', { error: e.message, stack: e.stack });
}

// Boost tracker
try {
  require('./events/guildMemberUpdate_boostTracker')(client);
  logger.info('Boost tracker cargado');
} catch (e) {
  logger.error('Error cargando boost tracker', { error: e.message, stack: e.stack });
}

// Login
client.login(TOKEN);