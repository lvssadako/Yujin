const MAX_SHOP_ROLES = 15;
const ID_RE = /^[a-z0-9_]{3,32}$/;
const ROLE_RE = /^\d{5,25}$/;

const slug = name => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);

/** Devuelve { ok, roles } o { ok:false, error }. No muta la entrada. */
function addShopRole(current, { name, price, days, roleId, description }) {
  const list = Array.isArray(current) ? current : [];
  const id = slug(name);
  if (!ID_RE.test(id)) return { ok: false, error: 'El nombre debe tener al menos 3 letras o números.' };
  if (!ROLE_RE.test(String(roleId))) return { ok: false, error: 'Rol inválido.' };
  if (!Number.isInteger(price) || price < 1 || price > 100000000) return { ok: false, error: 'El precio debe ser un entero entre 1 y 100.000.000.' };
  if (!Number.isInteger(days) || days < 0 || days > 365) return { ok: false, error: 'Los días deben estar entre 0 (permanente) y 365.' };
  const without = list.filter(r => r.id !== id);
  if (without.length >= MAX_SHOP_ROLES) return { ok: false, error: `Máximo ${MAX_SHOP_ROLES} roles en la tienda.` };
  const entry = { id, name: String(name).trim().slice(0, 40), price, roleId: String(roleId), days };
  if (description) entry.description = String(description).trim().slice(0, 120);
  return { ok: true, roles: [...without, entry], entry, replaced: without.length !== list.length };
}

function removeShopRole(current, id) {
  const list = Array.isArray(current) ? current : [];
  const roles = list.filter(r => r.id !== id);
  return { ok: roles.length !== list.length, roles, error: roles.length === list.length ? 'No existe un rol con ese ID.' : null };
}

function describeShopRoles(current) {
  const list = Array.isArray(current) ? current : [];
  if (!list.length) return 'No hay roles en la tienda. Agrega uno con `/shopadmin rol-agregar`.';
  return list.map(r => `\`${r.id}\` · **${r.name}** → <@&${r.roleId}> · ${r.price.toLocaleString('es-MX')} 🪙 · ${r.days > 0 ? r.days + ' días' : 'permanente'}`).join('\n');
}

module.exports = { MAX_SHOP_ROLES, slug, addShopRole, removeShopRole, describeShopRoles };
