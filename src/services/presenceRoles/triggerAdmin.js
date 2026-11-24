const MAX_TRIGGERS = 10;
const DEFAULT_INVITE = 'discord.gg/lco';
const ROLE_ID_RE = /^\d{5,25}$/;

function clean(triggers) {
  return Array.isArray(triggers) ? triggers.filter(t => t && ROLE_ID_RE.test(String(t.roleId))) : [];
}

/** Devuelve { ok, triggers } o { ok: false, error }. No muta la entrada. */
function setStatusTrigger(current, roleId, includes = DEFAULT_INVITE) {
  const text = String(includes || '').trim();
  if (!ROLE_ID_RE.test(String(roleId))) return { ok: false, error: 'Rol inválido.' };
  if (text.length < 3 || text.length > 100) return { ok: false, error: 'El enlace o texto debe tener entre 3 y 100 caracteres.' };
  const rest = clean(current).filter(t => !(t.field === 'status' && t.roleId === roleId));
  if (rest.length >= MAX_TRIGGERS) return { ok: false, error: `Máximo ${MAX_TRIGGERS} reglas de estado/tag.` };
  return { ok: true, triggers: [...rest, { field: 'status', includes: text, roleId }] };
}

function setTagTrigger(current, roleId) {
  if (!ROLE_ID_RE.test(String(roleId))) return { ok: false, error: 'Rol inválido.' };
  const rest = clean(current).filter(t => t.field !== 'tag'); // un solo rol por tag
  if (rest.length >= MAX_TRIGGERS) return { ok: false, error: `Máximo ${MAX_TRIGGERS} reglas de estado/tag.` };
  return { ok: true, triggers: [...rest, { field: 'tag', roleId }] };
}

function removeTriggersForRole(current, roleId) {
  const before = clean(current);
  const triggers = before.filter(t => t.roleId !== roleId);
  return { ok: true, triggers, removed: before.length - triggers.length };
}

function describeTriggers(current) {
  const list = clean(current);
  if (!list.length) return 'No hay reglas configuradas.';
  return list.map(t => t.field === 'tag'
    ? `🏷️ Tag del servidor → <@&${t.roleId}>`
    : `💬 Estado con \`${t.includes}\` → <@&${t.roleId}>`).join('\n');
}

module.exports = { MAX_TRIGGERS, DEFAULT_INVITE, setStatusTrigger, setTagTrigger, removeTriggersForRole, describeTriggers };
