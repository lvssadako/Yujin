const logger = require('../../utils/logger');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CATEGORIES = {
  admin: { name: 'Moderación', desc: 'Comandos de administración y seguridad.', emoji: '🛡️', color: 0xED4245 },
  economy: { name: 'Economía', desc: 'Sistemas de monedas y recompensas.', emoji: '💰', color: 0xFEE75C },
  games: { name: 'Juegos de Azar', desc: 'Minijuegos y apuestas.', emoji: '🎮', color: 0x9B59B6 },
  level: { name: 'Niveles y Perfil', desc: 'Experiencia y perfiles visuales.', emoji: '📈', color: 0x57F287 },
  boost: { name: 'Boosts', desc: 'Recompensas para Server Boosters.', emoji: '🚀', color: 0xF47FFF },
  config: { name: 'Configuración', desc: 'Ajustes internos del servidor.', emoji: '⚙️', color: 0x95A5A6 },
  utility: { name: 'Utilidad', desc: 'Herramientas generales.', emoji: '🛠️', color: 0x5865F2 }
};

const COMMAND_MAP = {
  ban: 'admin', kick: 'admin', timeout: 'admin', clear: 'admin', unban: 'admin',
  balance: 'economy', chest: 'economy', daily: 'economy', shop: 'economy', transfer: 'economy', ecotop: 'economy',
  blackjack: 'games', coinflip: 'games', crash: 'games', reactduel: 'games', ruleta: 'games', slots: 'games',
  level: 'level', streak: 'level', streaks: 'level', leaderboard: 'level', badge: 'level', profile: 'level', profileset: 'level',
  boosters: 'boost', boostxp: 'boost',
  leveladdchannel: 'config', leveladmin: 'config', levellistchannels: 'config', levelremovechannel: 'config', levelrewards: 'config', menuconfig: 'config', setboostchannel: 'config', setbumpreminder: 'config', setchannel: 'config',
  bumpreminderinfo: 'utility', help: 'utility', manage: 'utility', toproles: 'utility', info: 'utility', ping: 'utility'
};

async function buildHelpInterface(interactionOrMessage, isPrefix = false, query = null) {
  const client = interactionOrMessage.client;
  const user = isPrefix ? interactionOrMessage.author : interactionOrMessage.user;
  const commands = Array.from((client.commands || new Map()).values());

  // === BÚSQUEDA DETALLADA ===
  if (query) {
    const cmd = commands.find(c => 
      (c.data?.name && c.data.name.toLowerCase() === query.toLowerCase()) || 
      (c.name && c.name.toLowerCase() === query.toLowerCase())
    );

    if (!cmd) {
      const errEmbed = new EmbedBuilder().setColor(0xED4245).setDescription(`❌ No se encontró ningún comando llamado \`${query}\`.`);
      return isPrefix ? interactionOrMessage.reply({ embeds: [errEmbed] }) : interactionOrMessage.reply({ embeds: [errEmbed], ephemeral: true });
    }

    const cmdName = cmd.data?.name || cmd.name;
    const catId = COMMAND_MAP[cmdName] || 'utility';
    const catData = CATEGORIES[catId];

    const detailEmbed = new EmbedBuilder()
      .setTitle(`${catData.emoji} Comando: /${cmdName}`)
      .setDescription(cmd.data?.description || cmd.description || 'Sin descripción disponible.')
      .setColor(catData.color)
      .addFields(
        { name: 'Categoría', value: catData.name, inline: true },
        { name: 'Uso', value: cmd.usage || `/${cmdName}`, inline: true }
      );

    return isPrefix ? interactionOrMessage.reply({ embeds: [detailEmbed] }) : interactionOrMessage.reply({ embeds: [detailEmbed], ephemeral: true });
  }

  // === MENÚ PRINCIPAL ===
  const categorized = {};
  Object.keys(CATEGORIES).forEach(k => categorized[k] = []);
  for (const cmd of commands) {
    const cmdName = cmd.data?.name || cmd.name;
    const cat = COMMAND_MAP[cmdName] || 'utility';
    categorized[cat].push({ name: cmdName, desc: cmd.data?.description || cmd.description || 'Sin descripción' });
  }

  const mainEmbed = new EmbedBuilder()
    .setTitle('📚 Centro de Ayuda de Yujin')
    .setDescription('¡Bienvenido! Selecciona una categoría en el menú desplegable para explorar los comandos.\n\n💡 *Tip: Puedes buscar detalles de un comando con `/help <comando>` o `&help <comando>`.*')
    .setColor(0x5865F2)
    .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `Solicitado por ${user.tag}`, iconURL: user.displayAvatarURL() });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('Explorar comandos por categoría...')
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
  
  const btnHome = new ButtonBuilder().setCustomId('help_home').setLabel('Volver al Inicio').setEmoji('🏠').setStyle(ButtonStyle.Secondary);
  const btnClose = new ButtonBuilder().setCustomId('help_close').setLabel('Cerrar').setEmoji('✖️').setStyle(ButtonStyle.Danger);
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

      const catEmbed = new EmbedBuilder()
        .setTitle(`${catData.emoji} ${catData.name}`)
        .setDescription(`*${catData.desc}*\n\n` + catCommands.map(c => `**/${c.name}** - ${c.desc}`).join('\n'))
        .setColor(catData.color)
        .setFooter({ text: `Categoría: ${catData.name} • ${catCommands.length} comandos` });

      await i.update({ embeds: [catEmbed], components: [rowMenu, rowButtons] });
    } 
    else if (i.customId === 'help_home') {
      await i.update({ embeds: [mainEmbed], components: [rowMenu, rowButtons] });
    } 
    else if (i.customId === 'help_close') {
      await i.update({ content: '✅ *Menú de ayuda cerrado.*', embeds: [], components: [] });
      collector.stop();
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason !== 'user') {
      try {
        const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true).setPlaceholder('Menú expirado por inactividad.');
        await msg.edit({ components: [new ActionRowBuilder().addComponents(disabledMenu)] });
      } catch {}
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra el centro de ayuda y detalles de comandos.')
    .addStringOption(opt => opt.setName('comando').setDescription('Busca información detallada de un comando').setRequired(false)),
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