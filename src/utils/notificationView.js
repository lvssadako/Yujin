const { createEmbed, COLORS, clip } = require('./ui');
const { VALID_CATEGORIES, CATEGORY_METADATA } = require('../services/notification/dmNotificationService');
const LABELS = { streaks: 'Rachas y recordatorios', warns: 'Moderación', levels: 'Subidas de nivel', boosts: 'Beneficios de booster', badges: 'Logros e insignias' };
const DESCRIPTIONS = {
  streaks: 'Recordatorios para proteger tu racha y avisos de hitos.',
  warns: 'Advertencias y sanciones que recibas en el servidor.',
  levels: 'Avisos cuando subes de nivel.',
  boosts: 'Tus recompensas y beneficios al impulsar el servidor.',
  badges: 'Insignias y logros que desbloqueas.',
};

function buildStatusEmbed(guild, user, prefs) {
  const muted = prefs.all === false;
  const embed = createEmbed().setAuthor({ name: 'Yujin ♥ · Tus notificaciones', iconURL: user.displayAvatarURL() })
    .setTitle(muted ? 'Mensajes directos pausados' : 'Tus avisos, a tu manera')
    .setDescription(clip(guild.name, 100) + '\n' + (muted ? 'No recibirás avisos automáticos por DM. Puedes activarlos cuando quieras.' : 'Elige qué avisos quieres recibir por mensaje directo.'));
  for (const key of VALID_CATEGORIES.filter(key => key !== 'all')) {
    const meta = CATEGORY_METADATA[key];
    embed.addFields({ name: LABELS[key] || meta.label, value: (prefs.all !== false && prefs[key] !== false ? '**Activados**' : '**Desactivados**') + '\n' + (DESCRIPTIONS[key] || meta.description), inline: false });
  }
  return embed.addFields({ name: 'Cambiar preferencias', value: '`/notificaciones activar tipo:categoría`\n`/notificaciones desactivar tipo:categoría`\nCon prefijo: `&notificaciones on categoría` o `off categoría`.' })
    .setFooter({ text: 'Tus preferencias se aplican a los mensajes directos de este servidor.' });
}
function buildResultEmbed(guild, user, category, enabled) {
  const label = CATEGORY_METADATA[category]?.label || category;
  return createEmbed(enabled ? COLORS.success : COLORS.neutral)
    .setAuthor({ name: 'Yujin ♥ · Preferencias guardadas', iconURL: user.displayAvatarURL() })
    .setTitle(enabled ? 'Avisos activados' : 'Avisos desactivados')
    .setDescription('**' + label + '** · ' + clip(guild.name, 100) + '\n' + (enabled ? 'Recibirás estos avisos por mensaje directo.' : 'Dejarás de recibir estos avisos por mensaje directo.'))
    .setFooter({ text: 'Consulta todas tus preferencias con /notificaciones estado o &notificaciones estado.' });
}
module.exports = { buildStatusEmbed, buildResultEmbed };
