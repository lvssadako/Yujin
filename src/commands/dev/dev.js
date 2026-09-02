const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const util = require('node:util');
const path = require('node:path');
const os = require('node:os');
const { isOwnerOrDev, getStaffRole, getOwnerIds, getDeveloperIds } = require('../../utils/staffAuth');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embedFactory');
const { reloadCommandRegistry, syncSlashCommands } = require('../../loaders/commandLoader');
const { economyService } = require('../../services/economy');
const { getLoan, repayLoan, resetLoan, applyInterestTick, getUserLoanSummary } = require('../../services/economy/loanService');
const logger = require('../../utils/logger');

// ─── Helpers de formato y seguridad ──────────────────────────────────────────

function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function sanitizeSecrets(str) {
  if (typeof str !== 'string') return str;
  let clean = str;
  if (process.env.TOKEN) clean = clean.replaceAll(process.env.TOKEN, '[REDACTED_BOT_TOKEN]');
  if (process.env.GITHUB_WEBHOOK_SECRET) clean = clean.replaceAll(process.env.GITHUB_WEBHOOK_SECRET, '[REDACTED_WEBHOOK_SECRET]');
  return clean;
}

// ─── Subcomandos de Gestión ──────────────────────────────────────────────────

async function handleStatus(client, user) {
  const staffRole = getStaffRole(user.id);
  const memory = process.memoryUsage();
  const uptime = process.uptime();
  const owners = getOwnerIds();
  const devs = getDeveloperIds();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: '🛠️ Panel de Control — Developer & Owner', iconURL: client.user.displayAvatarURL() })
    .setDescription(`Sesión activa autenticada como: **${staffRole}** (<@${user.id}>)`)
    .addFields(
      {
        name: '🤖 Estado del Bot',
        value:
          `> **Ping WS:** \`${client.ws.ping}ms\`\n` +
          `> **Uptime:** \`${formatUptime(uptime)}\`\n` +
          `> **Servidores:** \`${client.guilds.cache.size}\`\n` +
          `> **Comandos cargados:** \`${client.commands?.size || 0}\``,
        inline: true
      },
      {
        name: '💻 Sistema y Proceso',
        value:
          `> **Node.js:** \`${process.version}\`\n` +
          `> **Plataforma:** \`${os.platform()} (${os.arch()})\`\n` +
          `> **PID:** \`${process.pid}\`\n` +
          `> **CPUs:** \`${os.cpus().length} núcleos\``,
        inline: true
      },
      {
        name: '📊 Memoria RAM',
        value:
          `> **RSS:** \`${formatBytes(memory.rss)}\`\n` +
          `> **Heap Usado:** \`${formatBytes(memory.heapUsed)}\`\n` +
          `> **Heap Total:** \`${formatBytes(memory.heapTotal)}\`\n` +
          `> **Externa:** \`${formatBytes(memory.external)}\``,
        inline: true
      },
      {
        name: '👥 Staff Configurado (.env)',
        value:
          `> **👑 Dueños (${owners.length}):** ${owners.map(id => `<@${id}>`).join(', ') || '*(No configurado)*'}\n` +
          `> **💻 Developers (${devs.length}):** ${devs.map(id => `<@${id}>`).join(', ') || '*(No configurado)*'}`,
        inline: false
      }
    )
    .setFooter({ text: 'LCO Bot — Módulo exclusivo para desarrolladores' })
    .setTimestamp();

  return { embed };
}

async function handleEval(code, client, interactionOrMessage) {
  if (!code || typeof code !== 'string') {
    return { error: '❌ Proporciona el código JavaScript que deseas evaluar.' };
  }

  const start = process.hrtime.bigint();
  let result;
  let isError = false;

  try {
    // Si contiene await a nivel superior, envolver en async IIFE
    const trimmed = code.trim();
    const evalCode = trimmed.includes('await ') && !trimmed.startsWith('(async')
      ? `(async () => {\n${trimmed}\n})()`
      : trimmed;

    result = await eval(evalCode);
  } catch (err) {
    result = err;
    isError = true;
  }

  const end = process.hrtime.bigint();
  const executionTimeMs = (Number(end - start) / 1_000_000).toFixed(2);

  let formattedResult;
  if (typeof result === 'string') {
    formattedResult = result;
  } else {
    formattedResult = util.inspect(result, { depth: 2, maxArrayLength: 20 });
  }

  formattedResult = sanitizeSecrets(formattedResult);
  if (formattedResult.length > 1800) {
    formattedResult = formattedResult.slice(0, 1800) + '\n... (salida truncada)';
  }

  const embed = new EmbedBuilder()
    .setColor(isError ? 0xED4245 : 0x57F287)
    .setAuthor({ name: isError ? '❌ Error en Eval' : '✅ Resultado de Eval' })
    .addFields(
      {
        name: '📥 Código Evaluado',
        value: `\`\`\`js\n${code.length > 900 ? code.slice(0, 900) + '...' : code}\n\`\`\``,
        inline: false
      },
      {
        name: isError ? '⚠️ Error Arrojado' : '📤 Salida',
        value: `\`\`\`js\n${formattedResult || 'undefined'}\n\`\`\``,
        inline: false
      },
      {
        name: '⏱️ Tiempo de Ejecución',
        value: `\`${executionTimeMs} ms\``,
        inline: true
      },
      {
        name: '🏷️ Tipo de Retorno',
        value: `\`${isError ? 'Error (' + result.name + ')' : typeof result}\``,
        inline: true
      }
    )
    .setTimestamp();

  return { embed };
}

async function handleReload(client, syncDiscord = false) {
  const paths = {
    commandsDir: path.join(__dirname, '..'),
    sharedDir: path.join(__dirname, '..', '..', 'commands_shared'),
    prefixDir: path.join(__dirname, '..', '..', 'prefixCommands'),
    servicesDir: path.join(__dirname, '..', '..', 'services'),
    constantsDir: path.join(__dirname, '..', '..', 'constants'),
    utilsDir: path.join(__dirname, '..', '..', 'utils')
  };

  const registry = reloadCommandRegistry(client, paths);
  let syncMsg = '';

  if (syncDiscord && process.env.TOKEN && process.env.CLIENT_ID && process.env.GUILD_ID) {
    const syncRes = await syncSlashCommands({
      token: process.env.TOKEN,
      clientId: process.env.CLIENT_ID,
      guildId: process.env.GUILD_ID,
      commandData: registry.commandData,
      force: true
    });
    syncMsg = syncRes.synced
      ? `\n🌐 Sincronizados **${syncRes.count}** comandos con la API de Discord.`
      : `\n⚠️ Error de sincronización Discord: \`${syncRes.error || syncRes.reason}\``;
  }

  const embed = createSuccessEmbed(
    '🔄 Recarga en Caliente Completada',
    `Se han recargado en memoria exitosamente:\n• **${registry.commands.size}** comandos slash\n• **${registry.prefixCommands.size}** comandos de prefijo\n• Servicios, utilidades y constantes.${syncMsg}`
  );

  return { embed };
}

async function handleRestart() {
  const embed = createSuccessEmbed(
    '🔄 Reinicio de Proceso Iniciado',
    'El bot cerrará conexiones y se reiniciará de forma controlada...\nEstará disponible en unos instantes.'
  );

  setTimeout(() => {
    process.exit(0);
  }, 1000);

  return { embed };
}

async function handleEco(guildId, targetUser, action, amount) {
  if (!targetUser) return { error: '❌ Especifica un usuario válido.' };
  const userId = targetUser.id;
  const num = parseInt(amount, 10);

  if (action === 'give' || action === 'add') {
    if (isNaN(num) || num <= 0) return { error: '❌ Especifica una cantidad válida a entregar.' };
    economyService.addCoins(guildId, userId, num);
  } else if (action === 'set') {
    if (isNaN(num) || num < 0) return { error: '❌ Especifica un balance válido a establecer.' };
    const cur = economyService.getBalance(guildId, userId);
    if (cur.coins > num) {
      economyService.removeCoins(guildId, userId, cur.coins - num);
    } else if (cur.coins < num) {
      economyService.addCoins(guildId, userId, num - cur.coins);
    }
  } else if (action === 'reset') {
    const cur = economyService.getBalance(guildId, userId);
    if (cur.coins > 0) economyService.removeCoins(guildId, userId, cur.coins);
  } else {
    return { error: '❌ Acción no reconocida (`give`, `set`, `reset`).' };
  }

  const bal = economyService.getBalance(guildId, userId);
  const embed = createSuccessEmbed(
    '💰 Balance Modificado por Dev',
    `Usuario: <@${userId}>\nAcción: **${action.toUpperCase()}**\nNuevo Balance: **${bal.coins.toLocaleString()} 🪙** (Banco: **${bal.bank.toLocaleString()} 🪙**)`
  );
  return { embed };
}

async function handleLoan(guildId, targetUser, action) {
  if (!targetUser) return { error: '❌ Especifica un usuario válido.' };
  const userId = targetUser.id;

  if (action === 'status') {
    const summary = getUserLoanSummary(guildId, userId);
    const embed = new EmbedBuilder()
      .setColor(summary.active ? 0xF1C40F : 0x57F287)
      .setTitle(`🏦 Inspección de Préstamo — ${targetUser.tag}`)
      .setDescription(
        summary.active
          ? `> **Principal:** \`${summary.principal.toLocaleString()} 🪙\`\n` +
            `> **Deuda:** \`${summary.balance.toLocaleString()} 🪙\` (x${(summary.balance / summary.principal).toFixed(2)})\n` +
            `> **Tasa:** \`${(summary.interestRate * 100).toFixed(0)}%\` · Días: \`${summary.tickCount}\`\n` +
            `> **Penalización:** Nivel \`${summary.penaltyLevel}\`\n` +
            `> **Tope Alcanzado:** \`${summary.isCapped ? 'SÍ (Congelado)' : 'NO'}\``
          : '> ✅ El usuario **no tiene préstamos activos**.'
      );
    return { embed };
  }

  if (action === 'tick') {
    const tickRes = applyInterestTick(guildId, userId, { force: true });
    if (!tickRes) return { error: '❌ El usuario no tiene un préstamo activo para aplicar ticks.' };
    const embed = createSuccessEmbed(
      '⏩ Tick de Préstamo Forzado',
      `Usuario: <@${userId}>\nInterés Añadido: **+${tickRes.interestAdded.toLocaleString()} 🪙**\nNuevo Saldo: **${tickRes.newBalance.toLocaleString()} 🪙**\nTasa: **${(tickRes.newRate * 100).toFixed(0)}%** · Nivel Penalización: **${tickRes.penaltyLevel}**`
    );
    return { embed };
  }

  if (action === 'clear' || action === 'reset') {
    const loan = getLoan(guildId, userId);
    if (!loan || !loan.active) return { error: '❌ El usuario no tiene préstamos activos para limpiar o reiniciar.' };
    const res = resetLoan(guildId, userId);
    if (!res.success) return { error: `❌ ${res.reason}` };
    const embed = createSuccessEmbed(
      '🧹 Préstamo Liquidado y Reiniciado por Dev',
      `El préstamo del usuario <@${userId}> ha sido liquidado y reseteado a 0.\nDeuda previa cancelada: **${res.previousBalance.toLocaleString()} 🪙**.`
    );
    return { embed };
  }

  return { error: '❌ Acción de préstamo no reconocida (`status`, `tick`, `clear`, `reset`).' };
}

// ─── Slash Command & Prefix Definition ────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dev')
    .setDescription('Comandos de administración y diagnóstico exclusivos para el Dueño y Desarrollador.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Muestra el estado interno del bot, sistema, memoria y schedulers.')
    )
    .addSubcommand(sub =>
      sub.setName('eval')
        .setDescription('Evalúa código JavaScript directamente en el contexto del bot.')
        .addStringOption(opt =>
          opt.setName('codigo')
            .setDescription('Código JavaScript a ejecutar')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('reload')
        .setDescription('Recarga en caliente todos los comandos y servicios sin reiniciar el bot.')
        .addBooleanOption(opt =>
          opt.setName('sync_discord')
            .setDescription('Sincronizar también con la API de Discord')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('restart')
        .setDescription('Reinicia el proceso del bot de forma controlada.')
    )
    .addSubcommand(sub =>
      sub.setName('eco')
        .setDescription('Ajusta el balance de economía de un usuario.')
        .addStringOption(opt =>
          opt.setName('accion')
            .setDescription('Acción a realizar (give, set, reset)')
            .setRequired(true)
            .addChoices(
              { name: 'Entregar monedas (give)', value: 'give' },
              { name: 'Establecer balance (set)', value: 'set' },
              { name: 'Resetear balance (reset)', value: 'reset' }
            )
        )
        .addUserOption(opt =>
          opt.setName('usuario')
            .setDescription('Usuario objetivo')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('cantidad')
            .setDescription('Cantidad de monedas')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('loan')
        .setDescription('Inspecciona o manipula préstamos para pruebas.')
        .addStringOption(opt =>
          opt.setName('accion')
            .setDescription('Acción (status, tick, clear, reset)')
            .setRequired(true)
            .addChoices(
              { name: 'Ver estado (status)', value: 'status' },
              { name: 'Forzar tick de interés (tick)', value: 'tick' },
              { name: 'Liquidar/Limpiar préstamo (clear)', value: 'clear' },
              { name: 'Resetear préstamo por completo (reset)', value: 'reset' }
            )
        )
        .addUserOption(opt =>
          opt.setName('usuario')
            .setDescription('Usuario objetivo')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('host')
        .setDescription('Muestra el monitoreo en tiempo real de recursos del servidor / VM Ubuntu.')
    )
    .addSubcommand(sub =>
      sub.setName('logs')
        .setDescription('Muestra los últimos 15 errores y advertencias registrados en los logs.')
        .addStringOption(opt =>
          opt.setName('filtro')
            .setDescription('Filtrar tipo de incidente')
            .setRequired(false)
            .addChoices(
              { name: 'Todos (Errores + Advertencias)', value: 'all' },
              { name: 'Solo Errores (Errors)', value: 'error' },
              { name: 'Solo Advertencias (Warnings)', value: 'warn' }
            )
        )
        .addIntegerOption(opt =>
          opt.setName('cantidad')
            .setDescription('Cantidad de logs a ver (1 - 25)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    ),

  async execute(interaction, client) {
    if (!isOwnerOrDev(interaction.user.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Dueño y Desarrollador** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en el archivo `.env` para obtener acceso.'
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    let result;

    if (sub === 'status') {
      result = await handleStatus(client, interaction.user);
    } else if (sub === 'host') {
      const { renderHostEmbed } = require('./host');
      const embed = await renderHostEmbed(client, interaction.user);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'logs') {
      const { renderLogsEmbed } = require('./logs');
      const filter = interaction.options.getString('filtro') || 'all';
      const limit = interaction.options.getInteger('cantidad') || 15;
      const embed = await renderLogsEmbed(client, interaction.user, filter, limit);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    } else if (sub === 'eval') {
      const code = interaction.options.getString('codigo');
      result = await handleEval(code, client, interaction);
    } else if (sub === 'reload') {
      const syncDiscord = interaction.options.getBoolean('sync_discord') || false;
      result = await handleReload(client, syncDiscord);
    } else if (sub === 'restart') {
      result = await handleRestart();
    } else if (sub === 'eco') {
      const action = interaction.options.getString('accion');
      const targetUser = interaction.options.getUser('usuario');
      const amount = interaction.options.getInteger('cantidad');
      result = await handleEco(interaction.guildId, targetUser, action, amount);
    } else if (sub === 'loan') {
      const action = interaction.options.getString('accion');
      const targetUser = interaction.options.getUser('usuario');
      result = await handleLoan(interaction.guildId, targetUser, action);
    } else {
      return interaction.reply({ content: '❌ Subcomando no reconocido.', ephemeral: true });
    }

    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    return interaction.reply({ embeds: [result.embed], ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!isOwnerOrDev(message.author.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Dueño y Desarrollador** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en el archivo `.env` para obtener acceso.'
      );
      return message.reply({ embeds: [embed] });
    }

    const sub = (args[0] || 'status').toLowerCase();
    let result;

    if (sub === 'status' || sub === 'stats' || sub === 'info') {
      result = await handleStatus(client, message.author);
    } else if (sub === 'host' || sub === 'vm' || sub === 'vps' || sub === 'sys') {
      const { renderHostEmbed } = require('./host');
      const embed = await renderHostEmbed(client, message.author);
      return message.reply({ embeds: [embed] });
    } else if (sub === 'logs' || sub === 'log' || sub === 'errors') {
      const { renderLogsEmbed } = require('./logs');
      const filter = args[1]?.toLowerCase() === 'error' ? 'error' : (args[1]?.toLowerCase() === 'warn' ? 'warn' : 'all');
      const limit = parseInt(args[2] || args[1], 10) || 15;
      const embed = await renderLogsEmbed(client, message.author, filter, limit);
      return message.reply({ embeds: [embed] });
    } else if (sub === 'eval' || sub === 'e') {
      const code = args.slice(1).join(' ');
      result = await handleEval(code, client, message);
    } else if (sub === 'reload' || sub === 'r') {
      const syncDiscord = args[1]?.toLowerCase() === 'sync';
      result = await handleReload(client, syncDiscord);
    } else if (sub === 'restart') {
      result = await handleRestart();
    } else if (sub === 'eco' || sub === 'money') {
      const action = args[1]?.toLowerCase();
      const targetUser = message.mentions.users.first() || client.users.cache.get(args[2]);
      const amount = args[3] || args[2];
      result = await handleEco(message.guild.id, targetUser, action, amount);
    } else if (sub === 'loan') {
      const action = args[1]?.toLowerCase();
      const targetUser = message.mentions.users.first() || client.users.cache.get(args[2]);
      result = await handleLoan(message.guild.id, targetUser, action);
    } else {
      return message.reply('❌ Subcomandos disponibles: `status`, `host`, `logs [error|warn] [1-25]`, `eval <code>`, `reload [sync]`, `restart`, `eco <give|set|reset> <@user> <cantidad>`, `loan <status|tick|clear> <@user>`');
    }

    if (result.error) return message.reply(result.error);
    return message.reply({ embeds: [result.embed] });
  }
};
