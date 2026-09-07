const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  VALID_CATEGORIES,
  CATEGORY_METADATA,
  getNotificationPreferences,
  setNotificationPreference
} = require('../../services/notification/dmNotificationService');
const { COLORS } = require('../../utils/embedFactory');

function buildStatusEmbed(guild, user, prefs) {
  const isAllDisabled = prefs.all === false;
  const embed = new EmbedBuilder()
    .setColor(isAllDisabled ? COLORS.error : COLORS.primary)
    .setAuthor({
      name: `Preferencias de Notificaciones por DM · ${user.username}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setTitle(isAllDisabled ? '🔕 Notificaciones Generales: SILENCIADAS' : '🔔 Notificaciones Generales: ACTIVAS')
    .setDescription(
      isAllDisabled
        ? `Actualmente **NO recibirás ningún mensaje directo (DM)** de **${guild.name}**.\n\n> 💡 Para activarlas nuevamente, usa \`/notificaciones activar\` o \`&notificaciones on\`.`
        : `Aquí puedes personalizar qué tipos de avisos directos (DM) deseas recibir de **${guild.name}**:\n`
    )
    .setFooter({ text: `${guild.name} · Sistema de Preferencias de Usuario` })
    .setTimestamp();

  for (const catKey of VALID_CATEGORIES) {
    if (catKey === 'all') continue;
    const meta = CATEGORY_METADATA[catKey];
    const isEnabled = prefs.all !== false && prefs[catKey] !== false;
    const badge = isEnabled ? '🟢 **Activada**' : '🔴 **Desactivada**';
    embed.addFields({
      name: `${meta.emoji} ${meta.label}`,
      value: `> Estado: ${badge}\n> *${meta.description}*`,
      inline: false
    });
  }

  embed.addFields({
    name: '⚙️ Comandos Rápidos',
    value:
      `• Desactivar todo: \`/notificaciones desactivar\` o \`&notificaciones off\`\n` +
      `• Activar todo: \`/notificaciones activar\` o \`&notificaciones on\`\n` +
      `• Por categoría: \`/notificaciones desactivar tipo: [categoría]\` o \`&notificaciones off [categoría]\``,
    inline: false
  });

  return embed;
}

function buildResultEmbed(guild, user, category, enabled, updatedPrefs) {
  const meta = CATEGORY_METADATA[category] || { label: category, emoji: '🔔' };
  const embed = new EmbedBuilder().setTimestamp();

  if (!enabled) {
    embed
      .setColor(COLORS.error)
      .setAuthor({ name: `Notificaciones Actualizadas · ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle(`🔕 ${meta.emoji} Notificaciones Desactivadas`)
      .setDescription(
        category === 'all'
          ? `Has **desactivado con éxito todas las notificaciones por DM** de **${guild.name}**.\n\n` +
            `• El bot no te enviará mensajes directos automáticos.\n` +
            `• Tu actividad en el servidor se seguirá registrando normalmente.`
          : `Has **desactivado** las notificaciones de **${meta.label}** por DM en **${guild.name}**.\n\n` +
            `• Ya no recibirás avisos directos de esta categoría.`
      )
      .addFields({
        name: '💡 ¿Cómo volver a activarlas?',
        value: `> Usa \`/notificaciones activar tipo: ${category}\` o \`&notificaciones on ${category}\` en cualquier momento.`,
        inline: false
      })
      .setFooter({ text: `${guild.name} · Preferencias de Notificación` });
  } else {
    embed
      .setColor(COLORS.success)
      .setAuthor({ name: `Notificaciones Actualizadas · ${user.username}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle(`🔔 ${meta.emoji} Notificaciones Activadas`)
      .setDescription(
        category === 'all'
          ? `Has **activado con éxito todas las notificaciones por DM** de **${guild.name}**.\n\n` +
            `• Recibirás avisos directos de rachas, moderación, subidas de nivel y beneficios de boost.`
          : `Has **activado** las notificaciones de **${meta.label}** por DM en **${guild.name}**.\n\n` +
            `• Comenzarás a recibir avisos directos de esta categoría.`
      )
      .addFields({
        name: '🔕 ¿Cómo silenciarlas?',
        value: `> Puedes desactivarlas con \`/notificaciones desactivar tipo: ${category}\` o \`&notificaciones off ${category}\`.`,
        inline: false
      })
      .setFooter({ text: `${guild.name} · Preferencias de Notificación` });
  }

  return embed;
}

function resolveCategoryInput(input) {
  if (!input) return 'all';
  const str = String(input).toLowerCase().trim();
  if (['all', 'todas', 'todo', 'todos', 'general', 'bot'].includes(str)) return 'all';
  if (['streaks', 'streak', 'racha', 'rachas', 'recordatorio', 'recordatorios'].includes(str)) return 'streaks';
  if (['warns', 'warn', 'advertencia', 'advertencias', 'sancion', 'sanciones'].includes(str)) return 'warns';
  if (['levels', 'level', 'nivel', 'niveles', 'xp'].includes(str)) return 'levels';
  if (['boosts', 'boost', 'booster', 'boosters'].includes(str)) return 'boosts';
  if (['badges', 'badge', 'logro', 'logros', 'medallas', 'medalla'].includes(str)) return 'badges';
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notificaciones')
    .setDescription('Gestiona tus preferencias de notificaciones y mensajes directos (DM) del bot.')
    .addSubcommand(sub =>
      sub
        .setName('estado')
        .setDescription('Consulta el estado de tus notificaciones y avisos directos por DM.')
    )
    .addSubcommand(sub =>
      sub
        .setName('desactivar')
        .setDescription('Desactiva las notificaciones por DM (todas o por categoría).')
        .addStringOption(opt =>
          opt
            .setName('tipo')
            .setDescription('Categoría de notificación que deseas silenciar')
            .setRequired(false)
            .addChoices(
              { name: '📬 Todas las notificaciones por DM (Silenciar todo)', value: 'all' },
              { name: '🔥 Rachas de actividad y recordatorios diarios', value: 'streaks' },
              { name: '⚠️ Advertencias de moderación (Warns)', value: 'warns' },
              { name: '⭐ Anuncios de subida de nivel (Level Up)', value: 'levels' },
              { name: '💎 Beneficios y recompensas de Booster', value: 'boosts' },
              { name: '🎖️ Logros y medallas desbloqueadas', value: 'badges' }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('activar')
        .setDescription('Activa las notificaciones por DM (todas o por categoría).')
        .addStringOption(opt =>
          opt
            .setName('tipo')
            .setDescription('Categoría de notificación que deseas activar')
            .setRequired(false)
            .addChoices(
              { name: '📬 Todas las notificaciones por DM', value: 'all' },
              { name: '🔥 Rachas de actividad y recordatorios diarios', value: 'streaks' },
              { name: '⚠️ Advertencias de moderación (Warns)', value: 'warns' },
              { name: '⭐ Anuncios de subida de nivel (Level Up)', value: 'levels' },
              { name: '💎 Beneficios y recompensas de Booster', value: 'boosts' },
              { name: '🎖️ Logros y medallas desbloqueadas', value: 'badges' }
            )
        )
    ),

  usage: '/notificaciones [estado | desactivar (tipo) | activar (tipo)]',

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Este comando solo puede utilizarse dentro de un servidor.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const user = interaction.user;

    if (subcommand === 'estado') {
      const prefs = getNotificationPreferences(guild.id, user.id);
      const embed = buildStatusEmbed(guild, user, prefs);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const categoryOption = interaction.options.getString('tipo') || 'all';
    const category = resolveCategoryInput(categoryOption) || 'all';
    const enabled = subcommand === 'activar';

    const updatedPrefs = setNotificationPreference(guild.id, user.id, category, enabled);
    const embed = buildResultEmbed(guild, user, category, enabled, updatedPrefs);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Este comando solo puede utilizarse dentro de un servidor.');
    }

    const guild = message.guild;
    const user = message.author;
    const sub = (args[0] || 'estado').toLowerCase();

    if (['estado', 'status', 'ver', 'check', 'info'].includes(sub)) {
      const prefs = getNotificationPreferences(guild.id, user.id);
      const embed = buildStatusEmbed(guild, user, prefs);
      return message.reply({ embeds: [embed] });
    }

    let enabled = false;
    let categoryInput = args[1] || 'all';

    if (['off', 'desactivar', 'disable', 'mute', 'silenciar', 'no', '0'].includes(sub)) {
      enabled = false;
    } else if (['on', 'activar', 'enable', 'unmute', 'si', 'sí', '1'].includes(sub)) {
      enabled = true;
    } else {
      // Si el usuario puso directamente la categoría: ej &notificaciones streaks off
      const directCat = resolveCategoryInput(sub);
      if (directCat) {
        categoryInput = directCat;
        const secondArg = (args[1] || 'off').toLowerCase();
        enabled = ['on', 'activar', 'enable', 'si', 'sí', '1'].includes(secondArg);
      } else {
        const prefs = getNotificationPreferences(guild.id, user.id);
        const embed = buildStatusEmbed(guild, user, prefs);
        return message.reply({ embeds: [embed] });
      }
    }

    const category = resolveCategoryInput(categoryInput);
    if (!category) {
      return message.reply(
        `❌ Categoría inválida. Opciones disponibles: \`all\` (todas), \`streaks\` (rachas), \`warns\` (advertencias), \`levels\` (niveles), \`boosts\` (boosts), \`badges\` (logros).`
      );
    }

    const updatedPrefs = setNotificationPreference(guild.id, user.id, category, enabled);
    const embed = buildResultEmbed(guild, user, category, enabled, updatedPrefs);

    return message.reply({ embeds: [embed] });
  },

  buildStatusEmbed,
  buildResultEmbed,
  resolveCategoryInput
};
