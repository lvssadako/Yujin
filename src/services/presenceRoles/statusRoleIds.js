// Roles de "enlace en el estado": el heredado (statusRoleId) y los de las reglas de estado de /statusrole.
function statusRoleIds(cfg = {}) {
  const ids = [];
  const legacy = cfg.statusRoleId || cfg.status?.roleId;
  if (typeof legacy === 'string' && legacy) ids.push(legacy);
  for (const t of Array.isArray(cfg.statusRoleTriggers) ? cfg.statusRoleTriggers : []) {
    if (t && t.field === 'status' && typeof t.roleId === 'string' && t.roleId) ids.push(t.roleId);
  }
  return [...new Set(ids)];
}

module.exports = { statusRoleIds };
