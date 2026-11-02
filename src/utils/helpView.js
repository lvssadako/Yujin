const { createEmbed, COLORS, clip } = require('./ui');
const { COMMAND_MAP } = require('./helpCategories');

const CATEGORIES = {
  level: { name: 'Progreso y rachas', emoji: '✨', desc: 'Niveles, rankings, perfiles e insignias.' },
  economy: { name: 'Economía', emoji: '🪙', desc: 'Tu saldo, recompensas, tienda y préstamos.' },
  games: { name: 'Juegos', emoji: '🎲', desc: 'Minijuegos, apuestas y duelos.' },
  utility: { name: 'Comunidad', emoji: '🧭', desc: 'Ayuda, avisos, sorteos y recordatorios.' },
  boost: { name: 'Boosters', emoji: '💜', desc: 'Beneficios, multiplicadores y colores.' },
  admin: { name: 'Moderación', emoji: '🛡️', desc: 'Advertencias, sanciones y auditoría.' },
  config: { name: 'Configuración', emoji: '⚙️', desc: 'Canales, roles y ajustes del servidor.' },
  dev: { name: 'Desarrollo', emoji: '🛠️', desc: 'Herramientas reservadas al dueño y desarrolladores.' },
};

function schema(command) {
  try { return command.data?.toJSON?.() || command.data || command; }
  catch { return command.data || command; }
}
function visibleCommands(commands, developer = false) {
  const unique = new Map();
  for (const command of commands) {
    const data = schema(command);
    const name = data.name || command.name;
    if (!name || (COMMAND_MAP[name] === 'dev' && !developer)) continue;
    unique.set(name, { command, name, desc: data.description || command.description || 'Consulta sus opciones en Discord.', category: COMMAND_MAP[name] || 'utility' });
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}
function commandPaths(data, prefix = '/' + data.name) {
  const subcommands = (data.options || []).filter(option => option.type === 1 || option.type === 2);
  if (subcommands.length) return subcommands.flatMap(option => commandPaths(option, prefix + ' ' + option.name));
  return [{ prefix, options: data.options || [] }];
}
function optionExample(option) {
  if (option.choices?.length) return String(option.choices[0].value);
  if (option.type === 6) return '@usuario';
  if (option.type === 7) return '#canal';
  if (option.type === 8) return '@rol';
  if (option.type === 4 || option.type === 10) return String(Math.min(option.max_value ?? Infinity, Math.max(option.min_value ?? 1, 100)));
  if (option.type === 5) return 'true';
  if (option.name === 'nombre' && option.autocomplete) return 'America/Mexico_City';
  return '<' + option.name + '>';
}
function slashExamples(command) {
  return commandPaths(schema(command)).map(path => path.prefix + path.options.map(option => ' ' + option.name + ':' + optionExample(option)).join(''));
}
function permissionText(entry) {
  if (entry.category === 'dev') return 'Dueño o desarrollador';
  if (['admin', 'config'].includes(entry.category) || ['streakcheck','boostercolors'].includes(entry.name)) return 'Requiere permisos de gestión';
  return 'Disponible para miembros';
}
const PREFIX_GUIDES = {
  bank: '&bank deposit <cantidad|all>\n&bank withdraw <cantidad|all>',
  loan: '&loan take <cantidad>\n&loan repay <cantidad|all>\n&loan status',
  streak: '&streak ver\n&streak top\n&streak zona America/Mexico_City',
  racha: '&racha ver\n&racha top\n&racha zona America/Mexico_City',
  leaderboard: '&leaderboard global general\n&leaderboard semanal texto\n&leaderboard diario voz',
  notificaciones: '&notificaciones estado\n&notificaciones on [categoría]\n&notificaciones off [categoría]',
  help: '&help [comando]', shop: '&shop [id]', daily: '&daily', balance: '&balance [@usuario]', bal: '&bal [@usuario]',
};
function buildHome(entries) {
  const categories = Object.keys(CATEGORIES).filter(key => entries.some(entry => entry.category === key));
  return createEmbed().setAuthor({ name: 'Yujin ♥ · Centro de ayuda' }).setTitle('💜 Bienvenido al mundo de Yujin')
    .setDescription('Un pequeño espacio para compartir, crecer y brillar juntos.\nElige una categoría y descubre lo que puedes hacer en nuestra comunidad.\n\n**✨ Tus primeros pasos**\n`/daily` · Tus recompensas y misiones\n`/leaderboard` · El progreso de la comunidad\n`/streak ver` · Tu racha y zona horaria\n`/notificaciones estado` · Tus avisos por DM')
    .addFields({ name: 'Comandos', value: String(entries.length), inline: true }, { name: 'Categorías', value: String(categories.length), inline: true }, { name: 'Busca una guía', value: '`/help comando:nombre`\n`&help nombre`', inline: true })
    .setFooter({ text: 'Yujin ♥ · Hecho para nuestra comunidad · Comandos / y & · 2 minutos' });
}
function buildCategory(entries, category, page = 0) {
  const group = entries.filter(entry => entry.category === category);
  const pages = Math.max(1, Math.ceil(group.length / 8));
  const current = Math.max(0, Math.min(pages - 1, page));
  const items = group.slice(current * 8, current * 8 + 8);
  const meta = CATEGORIES[category] || CATEGORIES.utility;
  const accents = { economy: COLORS.economy, boost: COLORS.boost, admin: COLORS.error, config: COLORS.neutral };
  const embed = createEmbed(accents[category] || COLORS.primary).setAuthor({ name: 'Yujin ♥ · Explora la comunidad' }).setTitle(meta.emoji + ' ' + meta.name)
    .setDescription(meta.desc + '\n\n' + (items.map(entry => '**`/' + entry.name + '`**\n' + clip(entry.desc, 160)).join('\n\n') || 'Todavía no hay comandos en esta categoría.'))
    .setFooter({ text: group.length + ' comandos · Página ' + (current + 1) + ' de ' + pages + ' · Elige un comando para ver su guía' });
  return { embed, items, page: current, pages };
}
function buildDetail(entry) {
  const examples = slashExamples(entry.command);
  const shown = examples.slice(0, 6);
  const more = examples.length > shown.length ? '\n… y ' + (examples.length - shown.length) + ' opciones más en el menú de Discord.' : '';
  const prefixUsage = PREFIX_GUIDES[entry.name] || (String(entry.command.usage || '').startsWith('&') ? entry.command.usage : '&' + entry.name + ' [argumentos]');
  return createEmbed().setAuthor({ name: 'Yujin ♥ · Guía de comandos' }).setTitle('/' + entry.name).setDescription(clip(entry.desc, 500))
    .addFields(
      { name: 'Categoría', value: CATEGORIES[entry.category]?.name || CATEGORIES.utility.name, inline: true },
      { name: 'Acceso', value: permissionText(entry), inline: true },
      { name: 'Opciones y ejemplos con /', value: clip(shown.map(line => '`' + line + '`').join('\n') + more, 1024), inline: false },
      { name: 'Con prefijo &', value: clip('```\n' + prefixUsage + '\n```', 1024), inline: false }
    ).setFooter({ text: 'Los valores entre < > se reemplazan; los valores entre [ ] son opcionales.' });
}
module.exports = { CATEGORIES, visibleCommands, slashExamples, buildHome, buildCategory, buildDetail };
