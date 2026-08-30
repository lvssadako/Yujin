const logger = require('../../utils/logger');
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

// Categorización manual para darle una estructura impecable
const CATEGORIES = {
  admin: { name: '🛡️ Moderación', desc: 'Comandos de administración y seguridad.' },
  economy: { name: '💰 Economía', desc: 'Sistemas de monedas, recompensas diarias y tienda.' },
  games: { name: '🎮 Juegos de Azar', desc: 'Minijuegos y apuestas para ganar (o perder) monedas.' },
  level: { name: '📈 Niveles y Perfil', desc: 'Experiencia, perfiles visuales e insignias.' },
  boost: { name: '🚀 Boosts', desc: 'Gestión y recompensas para Server Boosters.' },
  config: { name: '⚙️ Configuración', desc: 'Ajustes internos del servidor (Admin).' },
  utility: { name: '🛠️ Utilidad', desc: 'Herramientas generales e información.' }
};

const COMMAND_MAP = {
  // Admin
  ban: 'admin', kick: 'admin', timeout: 'admin', clear: 'admin', unban: 'admin',
  // Economy
  balance: 'economy', chest: 'economy', daily: 'economy', shop: 'economy', transfer: 'economy', ecotop: 'economy',
  // Games
  blackjack: 'games', coinflip: 'games', crash: 'games', reactduel: 'games', ruleta: 'games', slots: 'games',
  // Level & Profile
  level: 'level', streak: 'level', streaks: 'level', leaderboard: 'level', badge: 'level', profile: 'level', profileset: 'level',
  // Boost
  boosters: 'boost', boostxp: 'boost',
  // Config
  leveladdchannel: 'config', leveladmin: 'config', levellistchannels: 'config', levelremovechannel: 'config', levelrewards: 'config', menuconfig: 'config', setboostchannel: 'config', setbumpreminder: 'config', setchannel: 'config',
  // Utility
  bumpreminderinfo: 'utility', help: 'utility', manage: 'utility', toproles: 'utility'
};

async function buildHelpInterface(interactionOrMessage, isPrefix = false) {
  const client = interactionOrMessage.client;
  const user = isPrefix ? interactionOrMessage.author : interactionOrMessage.user;
  const commands = Array.from((client.commands || new Map()).values());

  // Organizar comandos reales disponibles
  const categorized = {};
  Object.keys(CATEGORIES).forEach(k => categorized[k] = []);

  for (const cmd of commands) {
    const cmdName = cmd.data?.name || cmd.name;
    const cat = COMMAND_MAP[cmdName] || 'utility';
    categorized[cat].push({
      name: cmdName,
      desc: cmd.data?.description || cmd.description || 'Sin descripción'
    });
  }

  // Embed principal
  const mainEmbed = new EmbedBuilder()
    .setTitle('📚 Centro de Ayuda de Yujin')
    .setDescription('¡Bienvenido al sistema de ayuda! Selecciona una categoría en el menú desplegable de abajo para ver los comandos disponibles.\n\n*Tip: Todos los comandos están disponibles usando `/` (Slash Commands).*')
    .setColor(0x5865F2)
    .setThumbnail(client.user.displayAvatarURL())
    .setFooter({ text: `Solicitado por ${user.tag}`, iconURL: user.displayAvatarURL() })
    .setTimestamp();

  // Menú desplegable
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category_select')
    .setPlaceholder('Elige una categoría de comandos...')
    .addOptions(
      Object.entries(CATEGORIES).map(([key, data]) => 
        new StringSelectMenuOptionBuilder()
          .setLabel(data.name)
          .setDescription(data.desc)
          .setValue(key)
      )
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);

  // Enviar mensaje inicial
  let msg;
  if (isPrefix) {
    msg = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [row] });
  } else {
    await interactionOrMessage.reply({ embeds: [mainEmbed], components: [row] });
    msg = await interactionOrMessage.fetchReply();
  }

  // Colector de interacción del menú
  const collector = msg.createMessageComponentCollector({
    filter: i => i.user.id === user.id,
    time: 120_000 // 2 minutos
  });

  collector.on('collect', async i => {
    if (i.customId === 'help_category_select') {
      const selected = i.values[0];
      const catData = CATEGORIES[selected];
      const catCommands = categorized[selected];

      const catEmbed = new EmbedBuilder()
        .setTitle(`${catData.name}`)
        .setDescription(`${catData.desc}\n\n` + catCommands.map(c => `**/${c.name}** - ${c.desc}`).join('\n'))
        .setColor(0x5865F2)
        .setFooter({ text: `Mostrando ${catCommands.length} comandos` });

      await i.update({ embeds: [catEmbed], components: [row] });
    }
  });

  collector.on('end', async () => {
    try {
      const disabledRow = new ActionRowBuilder().addComponents(
        StringSelectMenuBuilder.from(selectMenu).setDisabled(true).setPlaceholder('Menú expirado.')
      );
      await msg.edit({ components: [disabledRow] });
    } catch {}
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra el centro de ayuda y todos los comandos disponibles.'),
  async execute(interaction) {
    try {
      await buildHelpInterface(interaction, false);
    } catch (err) {
      logger.error('help command error:', err);
    }
  },
  async executePrefix(message, args, client) {
    try {
      await buildHelpInterface(message, true);
    } catch (err) {
      logger.error('help prefix error:', err);
    }
  }
};