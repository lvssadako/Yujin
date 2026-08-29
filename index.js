// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, REST, Routes, Events } = require('discord.js');
const { readConfig } = require('./utils/configCache');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Falta TOKEN, CLIENT_ID o GUILD_ID en .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates],
});

// ✅ Asegúrate de inicializar esto antes de usarlo
client.commands = new Collection();
client.slashCommands = new Collection();
client.prefixCommands = new Collection();


// Cargar comandos (CommonJS require)
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.existsSync(commandsPath) ? fs.readdirSync(commandsPath).filter(f => f.endsWith('.js')) : [];
const commandData = [];
for (const file of commandFiles) {
  const cmd = require(path.join(commandsPath, file));
  if (cmd && cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    commandData.push(cmd.data.toJSON());
  } else {
    console.warn(`Comando mal exportado: ${file}`);
  }
}

// Cargar comandos compartidos (slash + prefix)
const sharedPath = path.join(__dirname, 'commands_shared');
if (fs.existsSync(sharedPath)) {
  const sharedFiles = fs.readdirSync(sharedPath).filter(f => f.endsWith('.js'));
  for (const file of sharedFiles) {
    const cmd = require(path.join(sharedPath, file));
    if (cmd && cmd.data && cmd.executeSlash && cmd.name && cmd.executePrefix) {
      // slash
      client.commands.set(cmd.data.name, {
        data: cmd.data,
        execute: cmd.executeSlash
      });
      commandData.push(cmd.data.toJSON());
      // prefix
      client.prefixCommands.set(cmd.name, { execute: cmd.executePrefix });
    } else {
      console.warn(`Comando compartido mal exportado: ${file}`);
    }
  }
}

// Registrar comandos (guild — rápido)
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log('Registrando comandos en guild...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commandData });
    console.log('Comandos registrados.');
  } catch (err) {
    console.error('Error registrando comandos:', err);
  }
})();

client.once(Events.ClientReady, () => {
  console.log(`✅ Bot listo: ${client.user.tag}`);
});

// Manejo de interacciones (slash + selects)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      console.log(`🔹 Slash usado: ${interaction.commandName} por ${interaction.user.tag}`);
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) {
        console.log('⚠️ Comando no encontrado en colección.');
        return interaction.reply({ content: 'Comando no encontrado', flags: 64 });
      }
      console.log('✅ Ejecutando comando slash...');
      await cmd.execute(interaction, client);
      console.log('✅ Comando ejecutado con éxito.');

    } else if (interaction.isStringSelectMenu()) {
      // Select handler for color menu
      if (interaction.customId === 'lco_color_menu') {
        await interaction.deferReply({ flags: 64  });
        // read config fresh
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        const vipRoleId = cfg.vipRoleId;
        if (!vipRoleId) return interaction.editReply({ content: '❌ No hay rol requerido configurado.' });

        const member = interaction.member;
        const guild = interaction.guild;
        const vipRole = guild.roles.cache.get(vipRoleId);
        if (!vipRole || !member.roles.cache.has(vipRoleId)) {
          const mention = vipRole ? `<@&${vipRoleId}>` : 'el rol requerido';
          return interaction.editReply({ content: `❌ Necesitas el rol ${mention} para usar este menú.` });
        }

        const val = interaction.values[0];
        // remove all color roles first
        const colorEntries = Object.entries(cfg.colors || {});
        const colorRoleIds = colorEntries.map(([k, v]) => v.roleId);
        try {
          await member.roles.remove(colorRoleIds.filter(Boolean)).catch(() => {});
        } catch (err) { console.error('Error removiendo roles previos:', err); }

        if (val === 'remove_color') {
          return interaction.editReply({ content: '🎨 Has quitado tu color.' });
        }

        // val is key
        const item = cfg.colors && cfg.colors[val];
        if (!item) return interaction.editReply({ content: '⚠️ Opción inválida.' });

        try {
          await member.roles.add(item.roleId);
          return interaction.editReply({ content: `✅ Tu color fue cambiado a **${item.name}**.` });
        } catch (err) {
          console.error('Error asignando rol:', err);
          return interaction.editReply({ content: '⚠️ Error al asignar el rol (missing perms o posición de roles).' });
        }
      }
    }
  } catch (err) {
    console.error('Error InteractionCreate:', err);
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: '❌ Error interno.' });
      else await interaction.reply({ content: '❌ Error interno.', flags: 64  });
    } catch {}
  }
});

// Prefijo de comandos (puedes cambiarlo si quieres)
const PREFIX = '&';

// Colección para comandos con prefijo
client.prefixCommands = new Collection();

// Cargar comandos con prefijo
const prefixPath = path.join(__dirname, 'prefixCommands');
if (fs.existsSync(prefixPath)) {
  const prefixFiles = fs.readdirSync(prefixPath).filter(f => f.endsWith('.js'));
  for (const file of prefixFiles) {
    const cmd = require(path.join(prefixPath, file));
    if (cmd && cmd.name && cmd.execute) {
      client.prefixCommands.set(cmd.name, cmd);
    } else {
      console.warn(`Comando prefix mal exportado: ${file}`);
    }
  }
}

// Escuchar mensajes con prefijo
client.on(Events.MessageCreate, async (message) => {
  // Ignorar bots o mensajes sin prefijo
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  // Obtener comando y argumentos
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

const command = client.prefixCommands.get(commandName);
if (!command) {
  console.log(`⚠️ Comando prefix no encontrado: ${commandName}`);
  return;
}

console.log(`🔹 Prefix usado: ${commandName} por ${message.author.tag}`);
try {
  await command.execute(message, args, client);
  console.log(`✅ Comando prefix ejecutado correctamente.`);
} catch (err) {
  console.error(`❌ Error ejecutando comando prefix ${commandName}:`, err);
  await message.reply('❌ Ocurrió un error al ejecutar este comando.');
}

});


// Cargar  guildMemberUpdate (auto-removal)
const eventFile = path.join(__dirname, 'events', 'guildMemberUpdate.js');
if (fs.existsSync(eventFile)) {
  const handler = require(eventFile);
  if (handler && typeof handler === 'function') handler(client);
}

// Forzar carga del config ANTES de cargar eventos
console.log('🔧 Cargando configuración...');
const initialConfig = readConfig();
console.log('✅ Config cargado con', Object.keys(initialConfig.roleXpBonuses || {}).length, 'bonus de roles');

// Cargar eventos de niveles
const levelEvents = [
  './events/messageCreate_levels.js',
  './events/messageReactionAdd_levels.js',
  './events/voiceStateUpdate_levels.js'
];

for (const file of levelEvents) {
  try {
    const eventLoader = require(file);
    eventLoader(client); // ← Debe llamarse como función
    console.log(`✅ Evento cargado: ${file}`);
  } catch (err) {
    console.error(`❌ Error cargando ${file}:`, err);
  }
}
// registrar el tracker de boosts (evento guildmemberupdateboosttracker)
try {
  require('./events/guildMemberUpdate_boostTracker')(client);
  console.log('✅ Boost tracker cargado');
} catch (e) {
  console.error('⚠️ Error cargando boost tracker:', e);
}

// login
client.login(process.env.TOKEN);
