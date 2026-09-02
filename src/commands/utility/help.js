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

// Directorio de imágenes fuentes de Yujin
const SOURCES_DIR = path.join(__dirname, '..', '..', '..', 'sources');
const LOCAL_BANNER_PATH = path.join(__dirname, '..', '..', 'assets', 'banners', 'help_banner.jpg');
const HELP_BANNER_URL = 'https://media1.giphy.com/media/bZCJM3KKbzqUIu9Mds/giphy.gif';

function getHelpSourceImages() {
  const sources = [];
  try {
    if (fs.existsSync(SOURCES_DIR)) {
      const files = fs.readdirSync(SOURCES_DIR);
      for (const file of files) {
        if (/\.(jpe?g|png|webp|gif)$/i.test(file)) {
          sources.push(path.join(SOURCES_DIR, file));
        }
      }
    }
  } catch {}
  return sources;
}

const CATEGORIES = {
  admin: { 
    name: 'Moderación y Seguridad', 
    desc: 'Comandos de protección, expulsión, baneo y limpieza.', 
    emoji: '🛡️', 
    color: 0xED4245 
  },
  economy: { 
    name: 'Economía y Finanzas', 
    desc: 'Balance, transferencias, daily, cofres y tiendas.', 
    emoji: '💰', 
    color: 0xF1C40F 
  },
  games: { 
    name: 'Juegos y Casino', 
    desc: 'Minijuegos de azar: Blackjack, ruleta, coinflip y slots.', 
    emoji: '🎲', 
    color: 0x9B59B6 
  },
  level: { 
    name: 'Niveles, Perfil y Rachas', 
    desc: 'Rangos, experiencia, leaderboard, rachas y tarjetas HD.', 
    emoji: '✨', 
    color: 0x57F287 
  },
  boost: { 
    name: 'Servidor y Boosts', 
    desc: 'Beneficios, multiplicadores y recompensas a Boosters.', 
    emoji: '🚀', 
    color: 0xF47FFF 
  },
  config: { 
    name: 'Configuración Administrativa', 
    desc: 'Ajustes del servidor, canales de nivel y recompensas.', 
    emoji: '⚙️', 
    color: 0x95A5A6 
  },
  utility: { 
    name: 'Utilidades y Herramientas', 
    desc: 'Información general, recordatorios, ping y ayuda.', 
    emoji: '🧭', 
    color: 0x5865F2 
  }
};

const COMMAND_MAP = {
  ban: 'admin', kick: 'admin', timeout: 'admin', clear: 'admin', unban: 'admin', warn: 'admin',
  balance: 'economy', chest: 'economy', daily: 'economy', shop: 'economy', transfer: 'economy', ecotop: 'economy',
  blackjack: 'games', coinflip: 'games', crash: 'games', reactduel: 'games', ruleta: 'games', slots: 'games',
  level: 'level', leaderboard: 'level', badge: 'level', profile: 'level', profileset: 'level', racha: 'level', streak: 'level', streaks: 'level',
  boosters: 'boost', boostxp: 'boost',
  leveladdchannel: 'config', leveladmin: 'config', levellistchannels: 'config', levelremovechannel: 'config', levelrewards: 'config', menuconfig: 'config', setboostchannel: 'config', setbumpreminder: 'config', setchannel: 'config',
  bumpreminderinfo: 'utility', help: 'utility', manage: 'utility', toproles: 'utility', info: 'utility', ping: 'utility', reminder: 'utility'
};

function getCommandExample(cmdName) {
  const examples = {
    ruleta: '/ruleta apuesta: 500 opcion: rojo',
    coinflip: '/coinflip apuesta: 100 cara_cruz: cara',
    timeout: '/timeout usuario: @miembro minutos: 10 razon: spam',
    clear: '/clear cantidad: 50',
    transfer: '/transfer usuario: @amigo cantidad: 1000',
    profile: '/profile usuario: @miembro',
    streak: '/streak',
    leaderboard: '/leaderboard periodo: semanal categoria: general',
    balance: '/balance usuario: @miembro'
  };
  return examples[cmdName] || `/${cmdName}`;
}

function getPermissionBadge(catId) {
  if (catId === 'admin' || catId === 'config') return '`🛡️ Administrador / Moderador`';
  return '`👤 Todos los miembros`';
}

async function buildHelpInterface(interactionOrMessage, isPrefix = false, query = null) {
  const client = interactionOrMessage.client;
  const user = isPrefix ? interactionOrMessage.author : interactionOrMessage.user;
  const commands = Array.from((client.commands || new Map()).values());

  // === MODO INSPECCIÓN DETALLADA DE UN COMANDO ===
  if (query) {
    const cmd = commands.find(c => 
      (c.data?.name && c.data.name.toLowerCase() === query.toLowerCase()) || 
      (c.name && c.name.toLowerCase() === query.toLowerCase())
    );

    if (!cmd) {
      const errEmbed = new EmbedBuilder()
        .setColor(COLORS.error)
        .setTitle('❌ Comando No Encontrado')
        .setDescription(`No se encontró ningún comando registrado llamado **\`${query}\`**.\nUsa \`/help\` para ver la lista interactiva de todos los módulos.`)
        .setTimestamp();

      return isPrefix 
        ? interactionOrMessage.reply({ embeds: [errEmbed] }) 
        : interactionOrMessage.reply({ embeds: [errEmbed], ephemeral: true });
    }

    const cmdName = cmd.data?.name || cmd.name;
    const catId = COMMAND_MAP[cmdName] || 'utility';
    const catData = CATEGORIES[catId];
    const desc = cmd.data?.description || cmd.description || 'Sin descripción disponible.';

    const sources = getHelpSourceImages();
    const thumbImg = sources.find(s => s.includes('IMG_5311')) || sources[0] || null;
    const files = [];

    const detailEmbed = new EmbedBuilder()
      .setAuthor({ 
        name: `Guía de Comando • ${cmdName.toUpperCase()}`, 
        iconURL: client.user.displayAvatarURL() 
      })
      .setTitle(`${catData.emoji} \`/${cmdName}\``)
      .setDescription(`> *${desc}*`)
      .setColor(catData.color)
      .addFields(
        { name: '📂 Módulo', value: `**${catData.name}**`, inline: true },
        { name: '🔒 Permisos Requeridos', value: getPermissionBadge(catId), inline: true },
        { name: '💻 Sintaxis', value: `\`\`\`bash\n${cmd.usage || `/${cmdName}`}\n\`\`\``, inline: false },
        { name: '💡 Ejemplo de Uso', value: `\`\`\`bash\n${getCommandExample(cmdName)}\n\`\`\``, inline: false }
      )
      .setFooter({ text: `Yujin Bot • Módulo de ${catData.name}`, iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    if (thumbImg && fs.existsSync(thumbImg)) {
      files.push(new AttachmentBuilder(thumbImg, { name: 'help_thumb.jpg' }));
      detailEmbed.setThumbnail('attachment://help_thumb.jpg');
    } else {
      detailEmbed.setThumbnail(client.user.displayAvatarURL({ size: 256 }));
    }

    return isPrefix 
      ? interactionOrMessage.reply({ embeds: [detailEmbed], files }) 
      : interactionOrMessage.reply({ embeds: [detailEmbed], files, ephemeral: true });
  }

  // === MENÚ PRINCIPAL INTERACTIVO ===
  const categorized = {};
  Object.keys(CATEGORIES).forEach(k => { categorized[k] = []; });
  
  for (const cmd of commands) {
    const cmdName = cmd.data?.name || cmd.name;
    const cat = COMMAND_MAP[cmdName] || 'utility';
    categorized[cat].push({ 
      name: cmdName, 
      desc: cmd.data?.description || cmd.description || 'Sin descripción' 
    });
  }

  Object.keys(categorized).forEach(k => categorized[k].sort((a, b) => a.name.localeCompare(b.name)));

  const mainEmbed = new EmbedBuilder()
    .setAuthor({ 
      name: 'Centro de Ayuda y Comandos • Yujin', 
      iconURL: client.user.displayAvatarURL() 
    })
    .setTitle('✨ Explora todas las funciones')
    .setDescription(
      'Bienvenido al panel central de **Yujin**. Selecciona una categoría en el menú desplegable para ver la descripción de cada herramienta.\n\n' +
      '**Acceso Rápido:**\n' +
      '• 🌟 **/leaderboard** — Clasificación global, semanal y diaria (Texto y Voz)\n' +
      '• 🔥 **/streak** — Gestiona tu racha de actividad diaria\n' +
      '• 💰 **/daily** / **/balance** — Recompensas y estado económico\n' +
      '• 🛡️ **/warn** / **/timeout** / **/ban** — Moderación avanzada\n\n' +
      '> 💡 *¿Buscas un comando específico? Usa `/help comando: <nombre>`*'
    )
    .setColor(0x5865F2)
    .addFields(
      { name: '🗂️ Módulos', value: `\`${Object.keys(CATEGORIES).length} Categorías\``, inline: true },
      { name: '⚡ Comandos', value: `\`${commands.length} Disponibles\``, inline: true },
      { name: '📡 Estado', value: '`🟢 100% Operativo`', inline: true }
    );

  const sources = getHelpSourceImages();
  const mainBannerPath = sources.find(s => s.includes('IMG_6140')) || sources[0] || (fs.existsSync(LOCAL_BANNER_PATH) ? LOCAL_BANNER_PATH : null);
  const thumbImgPath = sources.find(s => s.includes('IMG_5311')) || sources.find(s => s !== mainBannerPath) || null;

  const files = [];
  if (mainBannerPath && fs.existsSync(mainBannerPath)) {
    files.push(new AttachmentBuilder(mainBannerPath, { name: 'help_banner.jpg' }));
    mainEmbed.setImage('attachment://help_banner.jpg');
  } else {
    mainEmbed.setImage(HELP_BANNER_URL);
  }

  if (thumbImgPath && fs.existsSync(thumbImgPath)) {
    files.push(new AttachmentBuilder(thumbImgPath, { name: 'help_thumb.jpg' }));
    mainEmbed.setThumbnail('attachment://help_thumb.jpg');
  }

  mainEmbed
    .setFooter({ 
      text: `Solicitado por ${user.tag}`, 
      iconURL: user.displayAvatarURL() 
    })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('📂 Elige una categoría para explorar...')
    .addOptions(
      Object.entries(CATEGORIES).map(([key, data]) => 
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
      const catData = CATEGORIES[selected];
      const catCommands = categorized[selected];

      const listFormatted = catCommands.length > 0
        ? catCommands.map(c => `• **\`/${c.name}\`** — ${c.desc}`).join('\n')
        : '*No hay comandos registrados en este módulo.*';

      const catEmbed = new EmbedBuilder()
        .setAuthor({ 
          name: `Directorio de Comandos • ${catData.name}`, 
          iconURL: client.user.displayAvatarURL() 
        })
        .setTitle(`${catData.emoji} Módulo de ${catData.name}`)
        .setDescription(`> *${catData.desc}*\n\n${listFormatted}`)
        .setColor(catData.color)
        .addFields({
          name: '💡 ¿Cómo usar?',
          value: 'Escribe el comando con `/` o usa `/help comando: <nombre>` para ver ejemplos detallados.'
        })
        .setFooter({ text: `${catCommands.length} comandos disponibles • Yujin Bot`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      if (thumbImgPath) {
        catEmbed.setThumbnail('attachment://help_thumb.jpg');
      }
      if (mainBannerPath) {
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