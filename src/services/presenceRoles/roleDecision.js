const { buildStatusMatcher, hasServerTag } = require('./statusMatcher');

/** Agrupa las reglas por rol: Map(roleId → { status: string[], tag: boolean }). */
function groupTriggersByRole(triggers) {
  const groups = new Map();
  for (const t of triggers || []) {
    if (!t || typeof t.roleId !== 'string' || !t.roleId) continue;
    const g = groups.get(t.roleId) || { status: [], tag: false };
    if (t.field === 'tag') g.tag = true;
    else if (t.field === 'status' && typeof t.includes === 'string' && t.includes.trim()) g.status.push(t.includes);
    groups.set(t.roleId, g);
  }
  return groups;
}

/**
 * ¿Debe tener el rol? true = sí, false = no, null = no se puede saber (no tocar).
 * Un rol se conserva si CUALQUIERA de sus reglas se cumple (enlace en el estado O tag del servidor).
 * Con varias reglas para el mismo rol, una regla que no coincide nunca quita el rol si otra sí coincide.
 * El estado solo es evaluable con presencia visible: offline/invisible → no se retira por estado.
 */
function decideRole(group, { text = '', visible = false, user = null, guildId = null } = {}) {
  const statusMatch = visible && group.status.some(includes => buildStatusMatcher(includes)(text));
  const tagMatch = group.tag && hasServerTag(user, guildId);
  if (statusMatch || tagMatch) return true;
  const statusEvaluable = group.status.length === 0 || visible;
  return statusEvaluable ? false : null;
}

module.exports = { groupTriggersByRole, decideRole };
