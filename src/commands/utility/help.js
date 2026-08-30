const logger = require('../../utils/logger');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CATEGORIES = {
  admin: { name: 'Moderación', desc: 'Control total y seguridad del servidor.', emoji: '🛡️', color: 0xED4245 },
  economy: { name: 'Economía', desc: 'Monedas, tiendas y finanzas.', emoji: '💰', color: 0xF1C40F },
  games: { name: 'Juegos y Apuestas', desc: 'Minijuegos para multiplicar monedas.', emoji: '🎲', color: 0x9B59B6 },
  level: { name: 'Niveles y Perfil', desc: 'Experiencia, rangos y tarjetas visuales.', emoji: '✨', color: 0x57F287 },
  boost: { name: 'Boosts', desc: 'Recompensas exclusivas para Boosters.', emoji: '🚀', color: 0xF47FFF },
  config: { name: 'Configuración', desc: 'Ajustes del sistema (Administradores).', emoji: '⚙️', color: 0x95A5A6 },
  utility: { name: 'Utilidad general', desc: 'Información y herramientas útiles.', emoji: '🧭', color: 0x5865F2 }
};

const COMMAND_MAP = {
  ban: 'admin', kick: 'admin', timeout: 'admin', clear: 'admin', unban: 'admin',
  balance: 'economy', chest: 'economy', daily: 'economy', shop: 'economy', transfer: 'economy', ecotop: 'economy',
  blackjack: 'games', coinflip: 'games', crash: 'games', reactduel: 'games', ruleta: 'games', slots: 'games',
  level: 'level', leaderboard: 'level', badge: 'level', profile: 'level', profileset: 'level',
  boosters: 'boost', boostxp: 'boost',
  leveladdchannel: 'config', leveladmin: 'config', levellistchannels: 'config', levelremovechannel: 'config', levelrewards: 'config', menuconfig: 'config', setboostchannel: 'config', setbumpreminder: 'config', setchannel: 'config',
  bumpreminderinfo: 'utility', help: 'utility', manage: 'utility', toproles: 'utility', info: 'utility', ping: 'utility', racha: 'utility', streak: 'utility', streaks: 'utility', reminder: 'utility'
};

// Generador automático de ejemplos estéticos para comandos populares
function getMockExample(cmdName) {
  const examples = {
    ruleta: '/ruleta apuesta: 500 opcion: rojo',
    coinflip: '/coinflip apuesta: 100 cara_cruz: cara',
    timeout: '/timeout usuario: @miembro minutos: 10 razon: spam',
    clear: '/clear cantidad: 50',
    transfer: '/transfer usuario: @amigo cantidad: 1000',
    profile: '/profile usuario: @miembro'
  };
  return examples[cmdName] || `/${cmdName} [opciones]`;
}

// Determinar permisos base visuales
function getMockPerms(catId) {
  if (catId === 'admin' || catId === 'config') return '`🛡️ Administrador / Mod`';
  return '`👤 Cualquier Usuario`';
}

async function buildHelpInterface(interactionOrMessage, isPrefix = false, query = null) {
  const client = interactionOrMessage.client;
  const user = isPrefix ? interactionOrMessage.author : interactionOrMessage.user;
  const commands = Array.from((client.commands || new Map()).values());

  // === BÚSQUEDA DETALLADA DE COMANDO (TARJETA PREMIUM) ===
  if (query) {
    const cmd = commands.find(c => 
      (c.data?.name && c.data.name.toLowerCase() === query.toLowerCase()) || 
      (c.name && c.name.toLowerCase() === query.toLowerCase())
    );

    if (!cmd) {
      const errEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`### ❌ Comando no encontrado\nNo existe ningún comando llamado **\`${query}\`**.\n*Usa \`/help\` para ver la lista completa.*`);
      return isPrefix ? interactionOrMessage.reply({ embeds: [errEmbed] }) : interactionOrMessage.reply({ embeds: [errEmbed], ephemeral: true });
    }

    const cmdName = cmd.data?.name || cmd.name;
    const catId = COMMAND_MAP[cmdName] || 'utility';
    const catData = CATEGORIES[catId];
    const desc = cmd.data?.description || cmd.description || 'Sin descripción disponible.';

    const detailEmbed = new EmbedBuilder()
      .setAuthor({ name: 'Inspección de Comando', iconURL: client.user.displayAvatarURL() })
      .setTitle(`${catData.emoji} Comando: \`/${cmdName}\``)
      .setDescription(`> *${desc}*`)
      .setColor(catData.color)
      .addFields(
        { name: '📂 Categoría', value: `**${catData.name}**`, inline: true },
        { name: '⚙️ Permisos', value: getMockPerms(catId), inline: true },
        { name: '💻 Sintaxis / Uso', value: `\`\`\`bash\n${cmd.usage || `/${cmdName}`}\n\`\`\``, inline: false },
        { name: '💡 Ejemplo', value: `\`\`\`bash\n${getMockExample(cmdName)}\n\`\`\``, inline: false }
      )
      .setThumbnail(client.user.displayAvatarURL({ size: 512 }))
      .setFooter({ text: `Módulo de ${catData.name} • Yujin Bot`, iconURL: 'https://cdn.discordapp.com/emojis/1054452140507205692.webp' }); // placeholder star icon

    return isPrefix ? interactionOrMessage.reply({ embeds: [detailEmbed] }) : interactionOrMessage.reply({ embeds: [detailEmbed], ephemeral: true });
  }

  // === MENÚ PRINCIPAL (BIENVENIDA PREMIUM) ===
  const categorized = {};
  Object.keys(CATEGORIES).forEach(k => categorized[k] = []);
  for (const cmd of commands) {
    const cmdName = cmd.data?.name || cmd.name;
    const cat = COMMAND_MAP[cmdName] || 'utility';
    categorized[cat].push({ name: cmdName, desc: cmd.data?.description || cmd.description || 'Sin descripción' });
  }

  // Ordenar alfabéticamente dentro de cada categoría
  Object.keys(categorized).forEach(k => categorized[k].sort((a, b) => a.name.localeCompare(b.name)));

  const mainEmbed = new EmbedBuilder()
    .setAuthor({ name: 'Central de Ayuda de Yujin', iconURL: client.user.displayAvatarURL() })
    .setTitle('👋 ¡Hola! Soy tu asistente')
    .setDescription(
      'Estoy aquí para ayudarte a moderar, gestionar la economía y divertir a tu comunidad.\n\n' +
      '### 🧭 Navegación\n' +
      '> **1.** Usa el **menú desplegable** abajo para explorar las categorías.\n' +
      '> **2.** Usa `/help <comando>` para ver la guía exacta de un comando.\n'
    )
    .setColor(0x2B2D31) // Color elegante (gris oscuro tipo Discord UI)
    .addFields(
      { name: '🗂️ Categorías', value: `\`${Object.keys(CATEGORIES).length}\``, inline: true },
      { name: '⚡ Comandos', value: `\`${commands.length}\``, inline: true }
    )
    .setImage('https://i.imgur.com/8QG4F9D.png') // Banner estético placeholder/separador
    .setFooter({ text: `Solicitado por ${user.tag}`, iconURL: user.displayAvatarURL() });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('Selecciona un módulo para explorar...')
    .addOptions(
      Object.entries(CATEGORIES).map(([key, data]) => 
        new StringSelectMenuOptionBuilder()
          .setLabel(data.name)
          .setDescription(data.desc)
          .setEmoji(data.emoji)
          .setValue(key)
      )
    );

  const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
  
  const btnHome = new ButtonBuilder().setCustomId('help_home').setLabel('Inicio').setEmoji('🏠').setStyle(ButtonStyle.Primary);
  const btnClose = new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setEmoji('✖️').setStyle(ButtonStyle.Secondary);
  const rowButtons = new ActionRowBuilder().addComponents(btnHome, btnClose);

  let msg;
  if (isPrefix) {
    msg = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [rowMenu, rowButtons] });
  } else {
    await interactionOrMessage.reply({ embeds: [mainEmbed], components: [rowMenu, rowButtons] });
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

      // Formateo premium de la lista de comandos (Blockquotes y code blocks)
      const listFormatted = catCommands.map(c => `**\`/${c.name}\`**\n> *${c.desc}*`).join('\n\n');

      const catEmbed = new EmbedBuilder()
        .setAuthor({ name: 'Directorio de Comandos', iconURL: client.user.displayAvatarURL() })
        .setTitle(`${catData.emoji} Módulo: ${catData.name}`)
        .setDescription(`Aquí tienes todas las herramientas disponibles para esta categoría:\n\n${listFormatted}`)
        .setColor(catData.color)
        .setFooter({ text: `${catCommands.length} comandos en ${catData.name}` });

      await i.update({ embeds: [catEmbed], components: [rowMenu, rowButtons] });
    } 
    else if (i.customId === 'help_home') {
      await i.update({ embeds: [mainEmbed], components: [rowMenu, rowButtons] });
    } 
    else if (i.customId === 'help_close') {
      await i.update({ content: '✅ *Panel de ayuda cerrado exitosamente.*', embeds: [], components: [] });
      collector.stop();
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'user') {
      try {
        const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true).setPlaceholder('Sesión expirada por inactividad.');
        await msg.edit({ components: [new ActionRowBuilder().addComponents(disabledMenu)] });
      } catch {}
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Abre el centro de ayuda de Yujin y descubre todos los comandos.')
    .addStringOption(opt => opt.setName('comando').setDescription('Busca la guía exacta de un comando específico').setRequired(false)),
  async execute(interaction) {
    try {
      const query = interaction.options.getString('comando');
      await buildHelpInterface(interaction, false, query);
    } catch (err) {
      logger.error('help command error:', err);
    }
  },
  async executePrefix(message, args, client) {
    try {
      const query = args[0] ? args[0].toLowerCase() : null;
      await buildHelpInterface(message, true, query);
    } catch (err) {
      logger.error('help prefix error:', err);
    }
  }
};