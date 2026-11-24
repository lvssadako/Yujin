// Reconocimiento de enlaces de invitación en el estado personalizado y del tag del servidor.

// Quita caracteres invisibles, unifica ancho completo (．／) y espacios alrededor de "." y "/".
function normalizeStatusText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[​-‏⁠﻿­]/g, '')
    .toLowerCase()
    .replace(/\s*([./])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "discord.gg/lco", ".gg/lco", "gg/lco" o "https://discord.com/invite/lco" → "lco"
function extractInviteCode(includes) {
  const norm = normalizeStatusText(includes).replace(/^https?:\/\//, '').replace(/^www\./, '');
  const match = /(?:^|[^a-z0-9])(?:gg|invite)\/([a-z0-9_-]{2,32})\/?$/.exec(norm);
  return match ? match[1] : null;
}

/**
 * Devuelve una función (textoDelEstado) => boolean.
 * Si `includes` es un enlace de invitación se aceptan sus variantes
 * (discord.gg, dsc.gg, gg/, discord.com/invite, discordapp.com/invite, con o sin https/www),
 * exigiendo que el código termine ahí (".gg/lco" no coincide con ".gg/lcobot").
 * Cualquier otro texto se busca como subcadena normalizada.
 */
function buildStatusMatcher(includes) {
  const needle = normalizeStatusText(includes);
  if (!needle) return () => false;
  const code = extractInviteCode(includes);
  if (!code) return text => normalizeStatusText(text).includes(needle);
  const c = escapeRegex(code);
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])(?:(?:discord(?:app)?\\.com\\/invite\\/)|(?:gg\\/))${c}(?![a-z0-9_-])`, 'i');
  return text => pattern.test(normalizeStatusText(text));
}

/** El usuario muestra el tag de ESTE servidor (Server Tag) y lo tiene activado. */
function hasServerTag(user, guildId) {
  const pg = user?.primaryGuild;
  return Boolean(pg && pg.identityEnabled !== false && pg.identityGuildId && String(pg.identityGuildId) === String(guildId));
}

module.exports = { normalizeStatusText, extractInviteCode, buildStatusMatcher, hasServerTag };
