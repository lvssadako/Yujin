const { createEmbed } = require('../../utils/ui');
const { SlashCommandBuilder, } = require('discord.js');
const {
  VALID_CATEGORIES,
  CATEGORY_METADATA,
  getNotificationPreferences,
  setNotificationPreference
} = require('../../services/notification/dmNotificationService');
const { COLORS } = require('../../utils/embedFactory');

const { buildStatusEmbed, buildResultEmbed } = require('../../utils/notificationView');

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
