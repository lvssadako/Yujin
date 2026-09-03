const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  AttachmentBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const { COLORS } = require('../../utils/embedFactory');
const { isOwnerOrDev } = require('../../utils/staffAuth');

// Directorio de imágenes fuentes de Yujin
const SOURCES_DIR = path.join(__dirname, '..', '..', '..', 'sources');
const AVATAR_PATH = path.join(SOURCES_DIR, 'avatar.jpg');
const LOCAL_BANNER_PATH = path.join(__dirname, '..', '..', 'assets', 'banners', 'help_banner.jpg');
const HELP_BANNER_URL = 'https://media1.giphy.com/media/bZCJM3KKbzqUIu9Mds/giphy.gif';

function getHelpBannerImages() {
  const banners = [];
  try {
    if (fs.existsSync(SOURCES_DIR)) {
      const files = fs.readdirSync(SOURCES_DIR);
      for (const file of files) {
        if (/^avatar\./i.test(file)) continue; // avatar.jpg se reserva para el thumbnail cuadrado
        if (/\.(jpe?g|png|webp|gif)$/i.test(file)) {
          banners.push(path.join(SOURCES_DIR, file));
        }
      }
    }
  } catch {}
  return banners;
}

let helpImageRotationIndex = 0;

function getNextRotatedBannerImage() {
  const banners = getHelpBannerImages();
  if (banners.length === 0) {
    return fs.existsSync(LOCAL_BANNER_PATH) ? LOCAL_BANNER_PATH : null;
  }
  const imgPath = banners[helpImageRotationIndex % banners.length];
  helpImageRotationIndex = (helpImageRotationIndex + 1) % banners.length;
  return imgPath;
}

const CATEGORIES = {
  level: { 
    name: 'Niveles, Perfiles y Rachas', 
    desc: 'Tarjetas HD, experiencia, leaderboard, perfiles personalizados, insignias y rachas.', 
    emoji: '✨', 
    color: 0x57F287 
  },
  economy: { 
    name: 'Economía y Finanzas', 
    desc: 'Billetera, banco, daily, trabajo, pesca, robos, tiendas, préstamos y transferencias.', 
    emoji: '💰', 
    color: 0xF1C40F 
  },
  games: { 
    name: 'Casino y Minijuegos', 
    desc: 'Blackjack 21, ruleta, tragamonedas, coinflip, crash y duelos de reacción.', 
    emoji: '🎲', 
    color: 0x9B59B6 
  },
  utility: { 
    name: 'Utilidades y Comunidad', 
    desc: 'Información de usuarios, sorteos, recordatorios, centro de ayuda y herramientas.', 
    emoji: '🧭', 
    color: 0x5865F2 
  },
  boost: { 
    name: 'Boosters y Servidor', 
    desc: 'Ventajas a boosters, multiplicadores activos de XP y menú de autoroles de colores.', 
    emoji: '🚀', 
    color: 0xF47FFF 
  },
  admin: { 
    name: 'Moderación y Seguridad', 
    desc: 'Sanciones (ban/kick/timeout/warn), limpieza de mensajes, automod y auditoría.', 
    emoji: '🛡️', 
    color: 0xED4245 
  },
  config: { 
    name: 'Configuración del Servidor', 
    desc: 'Ajustes maestros, canales de logs, recompensas de nivel, top roles y recordatorios.', 
    emoji: '⚙️', 
    color: 0x95A5A6 
  }
};

const DEV_CATEGORY = {
  dev: {
    name: '👑 Panel de Desarrollo y Owner',
    desc: 'Monitoreo de recursos de la VM Ubuntu, visor de logs de error/warn, eval seguro y control de bot.',
    emoji: '🛠️',
    color: 0x5865F2
  }
};

const COMMAND_MAP = {
  // Panel de Desarrollo y Owner (Exclusivo)
  dev: 'dev',
  host: 'dev',
  logs: 'dev',
  reload: 'dev',
  restart: 'dev',
  resetloan: 'dev',
  testboost: 'dev',
  testbutton: 'dev',
  testsecurity: 'dev',

  // Moderación y Seguridad
  addmoney: 'admin',
  ban: 'admin',
  unban: 'admin',
  kick: 'admin',
  timeout: 'admin',
  warn: 'admin',
  clear: 'admin',
  automod: 'admin',
  audit: 'admin',
  ecoadmin: 'admin',

  // Economía y Finanzas
  balance: 'economy',
  bal: 'economy',
  bank: 'economy',
  daily: 'economy',
  work: 'economy',
  fish: 'economy',
  rob: 'economy',
  loan: 'economy',
  pay: 'economy',
  transfer: 'economy',
  shop: 'economy',
  buy: 'economy',
  chest: 'economy',
  top: 'economy',
  ecotop: 'economy',

  // Casino y Minijuegos
  blackjack: 'games',
  ruleta: 'games',
  slots: 'games',
  coinflip: 'games',
  crash: 'games',
  reactduel: 'games',

  // Niveles, Perfiles y Rachas
  level: 'level',
  profile: 'level',
  profileset: 'level',
  badge: 'level',
  leaderboard: 'level',
  streak: 'level',
  racha: 'level',
  streaks: 'level',
  streaknotif: 'level',
  streakcheck: 'utility',

  // Boosters y Servidor
  boosters: 'boost',
  boostsxp: 'boost',
  boostxp: 'boost',
  boostercolors: 'boost',

  // Configuración del Servidor
  setchannel: 'config',
  setboostchannel: 'config',
  setlevelchannel: 'config',
  setbumpreminder: 'config',
  leveladmin: 'config',
  levelrewards: 'config',
  leveladdchannel: 'config',
  levelremovechannel: 'config',
  levellistchannels: 'config',
  toproles: 'config',
  menuconfig: 'config',

  // Utilidades y Comunidad
  help: 'utility',
  info: 'utility',
  userinfo: 'utility',
  sorteo: 'utility',
  reminder: 'utility',
  bumpreminderinfo: 'utility',
  manage: 'utility',
  ping: 'utility'
};

function getCommandExample(cmdName) {
  const examples = {
    // Admin
    addmoney: '/addmoney usuario: @usuario cantidad: 5000',
    ban: '/ban user: @usuario reason: Spam masivo days: 1',
    unban: '/unban target: 123456789012345678 reason: Apelación aceptada',
    kick: '/kick usuario: @usuario razon: Incumplimiento de normas',
    timeout: '/timeout usuario: @usuario minutos: 15 razon: Falta de respeto',
    warn: '/warn sub: add usuario: @usuario razon: Advertencia por flood',
    clear: '/clear cantidad: 50 usuario: @usuario',
    automod: '/automod',
    audit: '/audit canal: #auditoria-mensajes',
    ecoadmin: '/ecoadmin addmoney usuario: @usuario cantidad: 5000',
    reload: '/reload',
    restart: '/restart',

    // Economy
    balance: '/balance usuario: @usuario',
    bal: '/bal',
    bank: '/bank accion: depositar cantidad: 2000',
    daily: '/daily',
    work: '/work',
    fish: '/fish',
    rob: '/rob usuario: @usuario',
    loan: '/loan take cantidad: 10000 | /loan repay cantidad: all | /loan status',
    pay: '/pay destinatario: @amigo cantidad: 1500',
    transfer: '/transfer destinatario: @amigo cantidad: 1500',
    shop: '/shop',
    buy: '/buy item: caña_pesca cantidad: 1',
    chest: '/chest tipo: mistico',
    top: '/top tipo: coins',
    ecotop: '/ecotop',

    // Games
    blackjack: '/blackjack apuesta: 1000',
    ruleta: '/ruleta apuesta: 500 opcion: rojo',
    slots: '/slots apuesta: 250',
    coinflip: '/coinflip apuesta: 500 cara_cruz: cara',
    crash: '/crash apuesta: 1000',
    reactduel: '/reactduel usuario: @rival apuesta: 2000',

    // Level & Profile & Streak
    level: '/level usuario: @usuario',
    profile: '/profile usuario: @usuario',
    profileset: '/profileset fondo_url: https://... color_acento: #ff6b81 color_barra: #4ecdc4',
    badge: '/badge accion: equipar id: booster_oro slot: 1',
    leaderboard: '/leaderboard periodo: semanal categoria: general',
    streak: '/streak',
    racha: '/racha',
    streaks: '/streaks',
    streaknotif: '/streaknotif estado: off',
    streakcheck: '/streakcheck dias: 15 modo: execute',

    // Boost
    boosters: '/boosters',
    boostsxp: '/boostsxp',
    boostercolors: '/boostercolors canal: #roles-colores',

    // Config
    setchannel: '/setchannel tipo: logs canal: #canal-logs',
    setboostchannel: '/setboostchannel canal: #anuncios-boosts',
    setlevelchannel: '/setlevelchannel set canal: #nivel-anuncios | /setlevelchannel remove',
    setbumpreminder: '/setbumpreminder canal: #bump rol: @BumpReminder',
    leveladmin: '/leveladmin opcion: xp_rate valor: 1.5',
    levelrewards: '/levelrewards accion: agregar nivel: 10 rol: @Nivel10',
    leveladdchannel: '/leveladdchannel canal: #general multiplicador: 2',
    levelremovechannel: '/levelremovechannel canal: #general',
    levellistchannels: '/levellistchannels',
    toproles: '/toproles tipo: top1 rol: @Top1Chat',
    menuconfig: '/menuconfig',

    // Utility
    help: '/help comando: profile',
    info: '/info usuario: @usuario',
    userinfo: '/userinfo usuario: @usuario',
    sorteo: '/sorteo duracion: 2h ganadores: 1 premio: Nitro Classic',
    reminder: '/reminder tiempo: 30m mensaje: Estudiar para el examen',
    bumpreminderinfo: '/bumpreminderinfo',
    manage: '/manage',
    dev: '/dev status',
    host: '/host',
    logs: '/logs filtro: all cantidad: 15',
    resetloan: '/resetloan usuario: @usuario'
  };
  return examples[cmdName] || `/${cmdName}`;
}

function getPermissionBadge(catId, cmdName) {
  if (['reload', 'restart', 'testboost', 'testbutton', 'testsecurity', 'dev', 'host', 'logs', 'resetloan'].includes(cmdName)) {
    return '`👑 Bot Owner / Desarrollador`';
  }
  if (catId === 'admin' || catId === 'config' || cmdName === 'addmoney' || cmdName === 'ecoadmin' || cmdName === 'leveladmin' || cmdName === 'boostercolors' || cmdName === 'streakcheck') {
    return '`🛡️ Administrador / Moderador`';
  }
  return '`👤 Todos los miembros`';
}

async function buildHelpInterface(interactionOrMessage, isPrefix = false, query = null) {
  const client = interactionOrMessage.client;
  const user = isPrefix ? interactionOrMessage.author : interactionOrMessage.user;
  const commands = Array.from((client.commands || new Map()).values());
  const isDevUser = isOwnerOrDev(user.id);
  const activeCategories = isDevUser ? { ...CATEGORIES, ...DEV_CATEGORY } : { ...CATEGORIES };

  // === MODO INSPECCIÓN DETALLADA DE UN COMANDO ===
  if (query) {
    const cmd = commands.find(c => 
      (c.data?.name && c.data.name.toLowerCase() === query.toLowerCase()) || 
      (c.name && c.name.toLowerCase() === query.toLowerCase())
    );

    const cmdName = cmd?.data?.name || cmd?.name;
    const catId = cmdName ? (COMMAND_MAP[cmdName] || 'utility') : null;

    if (!cmd || (catId === 'dev' && !isDevUser)) {
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('❌ Comando No Encontrado')
        .setDescription(`No se encontró ningún comando registrado llamado **\`${query}\`**.\nUsa \`/help\` para ver la lista interactiva de todos los módulos.`)
        .setTimestamp();

      return isPrefix 
        ? interactionOrMessage.reply({ embeds: [errEmbed] }) 
        : interactionOrMessage.reply({ embeds: [errEmbed], ephemeral: true });
    }

    const catData = activeCategories[catId] || CATEGORIES.utility;
    const desc = cmd.data?.description || cmd.description || 'Sin descripción disponible.';

    const selectedBanner = getNextRotatedBannerImage();
    const files = [];

    const detailEmbed = new EmbedBuilder()
      .setAuthor({ name: `Guía de Comando • ${cmdName.toUpperCase()}` })
      .setTitle(`${catData.emoji} \`/${cmdName}\``)
      .setDescription(`> *${desc}*`)
      .setColor(catData.color)
      .addFields(
        { name: '📂 Módulo', value: `**${catData.name}**`, inline: true },
        { name: '🔒 Permisos Requeridos', value: getPermissionBadge(catId, cmdName), inline: true },
        { name: '💻 Sintaxis', value: `\`\`\`bash\n${cmd.usage || `/${cmdName}`}\n\`\`\``, inline: false },
        { name: '💡 Ejemplo de Uso', value: `\`\`\`bash\n${getCommandExample(cmdName)}\n\`\`\``, inline: false }
      )
      .setFooter({ text: `Yujin Bot • Módulo de ${catData.name}` })
      .setTimestamp();

    if (fs.existsSync(AVATAR_PATH)) {
      files.push(new AttachmentBuilder(AVATAR_PATH, { name: 'avatar.jpg' }));
      detailEmbed.setThumbnail('attachment://avatar.jpg');
    }

    if (selectedBanner && fs.existsSync(selectedBanner)) {
      files.push(new AttachmentBuilder(selectedBanner, { name: 'help_banner.jpg' }));
      detailEmbed.setImage('attachment://help_banner.jpg');
    }

    return isPrefix 
      ? interactionOrMessage.reply({ embeds: [detailEmbed], files }) 
      : interactionOrMessage.reply({ embeds: [detailEmbed], files, ephemeral: true });
  }

  // === MENÚ PRINCIPAL INTERACTIVO ===
  const categorized = {};
  Object.keys(activeCategories).forEach(k => { categorized[k] = []; });
  
  for (const cmd of commands) {
    const cmdName = cmd.data?.name || cmd.name;
    const cat = COMMAND_MAP[cmdName] || 'utility';
    if (cat === 'dev' && !isDevUser) continue;
    if (categorized[cat]) {
      categorized[cat].push({ 
        name: cmdName, 
        desc: cmd.data?.description || cmd.description || 'Sin descripción' 
      });
    }
  }

  Object.keys(categorized).forEach(k => categorized[k].sort((a, b) => a.name.localeCompare(b.name)));

  const devNotice = isDevUser 
    ? '\n> 👑 **Modo Developer/Owner:** Módulo de desarrollo y control del host desbloqueado.' 
    : '';

  const mainEmbed = new EmbedBuilder()
    .setAuthor({ name: 'Centro de Ayuda y Comandos • Yujin' })
    .setTitle('✨ Explora todas las funciones')
    .setDescription(
      'Bienvenido al panel central de **Yujin**. Selecciona una categoría en el menú desplegable para ver la descripción de cada herramienta.\n\n' +
      '**Acceso Rápido:**\n' +
      '• 🌟 **/leaderboard** — Clasificación global, semanal y diaria (Texto y Voz)\n' +
      '• 🔥 **/streak** — Gestiona tu racha de actividad diaria\n' +
      '• 💰 **/daily** / **/balance** — Recompensas y estado económico\n' +
      '• 🛡️ **/warn** / **/timeout** / **/ban** — Moderación avanzada\n' +
      devNotice + '\n\n' +
      '> 💡 *¿Buscas un comando específico? Usa `/help comando: <nombre>`*'
    )
    .setColor(0x5865F2)
    .addFields(
      { name: '🗂️ Módulos', value: `\`${Object.keys(activeCategories).length} Categorías\``, inline: true },
      { name: '⚡ Comandos', value: `\`${Object.values(categorized).flat().length} Disponibles\``, inline: true },
      { name: '📡 Estado', value: '`🟢 100% Operativo`', inline: true }
    );

  const selectedBanner = getNextRotatedBannerImage();
  const files = [];

  if (fs.existsSync(AVATAR_PATH)) {
    files.push(new AttachmentBuilder(AVATAR_PATH, { name: 'avatar.jpg' }));
    mainEmbed.setThumbnail('attachment://avatar.jpg');
  }

  if (selectedBanner && fs.existsSync(selectedBanner)) {
    files.push(new AttachmentBuilder(selectedBanner, { name: 'help_banner.jpg' }));
    mainEmbed.setImage('attachment://help_banner.jpg');
  } else {
    mainEmbed.setImage(HELP_BANNER_URL);
  }

  mainEmbed
    .setFooter({ text: `Solicitado por ${user.tag}` })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📂 Elige una categoría para explorar...')
    .addOptions(
      Object.entries(activeCategories).map(([key, data]) => 
        new StringSelectMenuOptionBuilder()
          .setLabel(data.name)
          .setDescription(data.desc.slice(0, 100))
          .setEmoji(data.emoji)
          .setValue(key)
      )
    );

  const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('help_home')
      .setLabel('Inicio')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('Cerrar')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  let msg;
  if (isPrefix) {
    msg = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [rowMenu, rowButtons], files });
  } else {
    await interactionOrMessage.reply({ embeds: [mainEmbed], components: [rowMenu, rowButtons], files });
    msg = await interactionOrMessage.fetchReply();
  }

  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === user.id,
    time: 120_000
  });

  collector.on('collect', async i => {
    if (i.customId === 'help_category_select') {
      const selected = i.values[0];
      const catData = activeCategories[selected] || CATEGORIES.utility;
      const catCommands = categorized[selected] || [];

      const listFormatted = catCommands.length > 0
        ? catCommands.map(c => `• **\`/${c.name}\`** — ${c.desc}`).join('\n')
        : '*No hay comandos registrados en este módulo.*';

      const catEmbed = new EmbedBuilder()
        .setAuthor({ name: `Directorio de Comandos • ${catData.name}` })
        .setTitle(`${catData.emoji} Módulo de ${catData.name}`)
        .setDescription(`> *${catData.desc}*\n\n${listFormatted}`)
        .setColor(catData.color)
        .addFields({
          name: '💡 ¿Cómo usar?',
          value: 'Escribe el comando con `/` o usa `/help comando: <nombre>` para ver ejemplos detallados.'
        })
        .setFooter({ text: `${catCommands.length} comandos disponibles • Yujin Bot` })
        .setTimestamp();

      if (fs.existsSync(AVATAR_PATH)) {
        catEmbed.setThumbnail('attachment://avatar.jpg');
      }

      if (selectedBanner) {
        catEmbed.setImage('attachment://help_banner.jpg');
      }

      await i.update({ embeds: [catEmbed], components: [rowMenu, rowButtons] });
    } else if (i.customId === 'help_home') {
      await i.update({ embeds: [mainEmbed], components: [rowMenu, rowButtons] });
    } else if (i.customId === 'help_close') {
      await i.update({ content: '✅ *Panel de ayuda cerrado.*', embeds: [], components: [] });
      collector.stop();
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'user') {
      try {
        const disabledMenu = StringSelectMenuBuilder.from(selectMenu)
          .setDisabled(true)
          .setPlaceholder('Sesión de ayuda expirada por inactividad.');
        await msg.edit({ components: [new ActionRowBuilder().addComponents(disabledMenu)] });
      } catch {}
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📖 Abre el centro de ayuda de Yujin y descubre todos los comandos.')
    .addStringOption(opt => 
      opt.setName('comando')
        .setDescription('Busca la guía y ejemplos de un comando específico')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      const query = interaction.options.getString('comando');
      await buildHelpInterface(interaction, false, query);
    } catch (err) {
      logger.error('help command error:', { error: err.message, stack: err.stack });
    }
  },

  async executePrefix(message, args, client) {
    try {
      const query = args[0] ? args[0].toLowerCase() : null;
      await buildHelpInterface(message, true, query);
    } catch (err) {
      logger.error('help prefix error:', { error: err.message, stack: err.stack });
    }
  }
};