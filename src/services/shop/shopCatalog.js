const { isStreakActive } = require('../streak/streakService');

// Categorías visibles en /shop. "all" muestra todo.
const CATEGORIES = Object.freeze({
  all: { label: 'Todo', emoji: '🛍️' },
  boosts: { label: 'Boosts', emoji: '⚡' },
  items: { label: 'Objetos', emoji: '🎒' },
  roles: { label: 'Roles', emoji: '🎭' },
  utility: { label: 'Utilidad', emoji: '🛠️' }
});

// Objetos de inventario (antes solo disponibles con /buy).
const INVENTORY_ITEMS = Object.freeze([
  { id: 'escudo', name: '🛡️ Escudo Anti-Robo', price: 5000, description: 'Te protege automáticamente de un intento de robo.', rarity: 'rare' },
  { id: 'cana', name: '🎣 Caña de Pescar', price: 2000, description: 'Desbloquea el comando /fish para pescar tesoros.', rarity: 'common' },
  { id: 'congelador', name: '🧊 Congelador de Racha', price: 3500, description: 'Salva automáticamente tu racha si olvidas chatear un día.', rarity: 'epic' }
]);

const UTILITY_ITEMS = Object.freeze([
  { id: 'reroll_misiones', kind: 'reroll', name: '🔄 Renovar misiones', price: 800, rarity: 'common',
    description: 'Cambia tus misiones diarias por otras nuevas. Solo si aún no has avanzado ni cobrado ninguna.' }
]);

const PROTECTED_DEFAULTS = {
  bundles: [
    { id: 'pack_2x_3h', name: 'Pack XP 3h', price: 35000, description: 'Incluye tres boosts de 2x durante 1 hora cada uno.', included: ['boost1h', 'boost1h', 'boost1h'], rarity: 'rare' },
    { id: 'vip_week', name: 'Pack semanal', price: 90000, description: '1 boost de 2x durante 24h y 2 boosts de 1.75x durante 3h.', included: ['boost24h', 'boost3h', 'boost3h'], rarity: 'epic' }
  ],
  featured: [
    { id: 'featured_2x_12h', name: 'Oferta especial • 2x 12h', price: 18000, multiplier: 2, durationMs: 43200000, description: 'Oferta del día para subir XP rápido.', rarity: 'epic' }
  ]
};

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

function buildCatalog(cfg = {}) {
  const catalog = [];
  for (const [id, item] of Object.entries(cfg.xpBoosts || {})) {
    catalog.push({
      id, category: 'boosts', kind: 'boost', name: item.name || id, price: num(item.price), multiplier: num(item.multiplier, 1),
      durationMs: num(item.durationMs, 3600000), description: item.description || `Boost de XP con multiplicador ${item.multiplier}x`,
      rarity: item.rarity || 'common', discountPercent: num(item.discountPercent), featured: false
    });
  }
  for (const item of Array.isArray(cfg.shopBundles) ? cfg.shopBundles : PROTECTED_DEFAULTS.bundles) {
    catalog.push({ ...item, category: 'boosts', kind: 'bundle', price: num(item.price), description: item.description || 'Paquete especial',
      rarity: item.rarity || 'rare', discountPercent: num(item.discountPercent), featured: Boolean(item.featured), included: Array.isArray(item.included) ? item.included : [] });
  }
  for (const item of Array.isArray(cfg.shopFeatured) ? cfg.shopFeatured : PROTECTED_DEFAULTS.featured) {
    catalog.push({ ...item, category: 'boosts', kind: item.kind || 'boost', price: num(item.price), description: item.description || 'Oferta especial',
      rarity: item.rarity || 'epic', discountPercent: num(item.discountPercent), featured: true, included: Array.isArray(item.included) ? item.included : [] });
  }
  for (const item of INVENTORY_ITEMS) catalog.push({ ...item, category: 'items', kind: 'item', discountPercent: 0, featured: false });
  for (const role of Array.isArray(cfg.shopRoles) ? cfg.shopRoles : []) {
    catalog.push({
      id: `role_${role.id}`, category: 'roles', kind: 'role', name: `🎭 ${role.name}`, price: num(role.price), roleId: role.roleId,
      days: num(role.days), description: role.description || 'Rol cosmético para tu perfil del servidor.', rarity: 'rare', discountPercent: 0, featured: false
    });
  }
  for (const item of UTILITY_ITEMS) catalog.push({ ...item, category: 'utility', discountPercent: 0, featured: false });
  // ids duplicados (config + integrados): gana el primero
  const seen = new Set();
  return catalog.filter(item => item.id && !seen.has(item.id) && seen.add(item.id));
}

function filterByCategory(catalog, category) {
  return category === 'all' || !CATEGORIES[category] ? catalog : catalog.filter(i => i.category === category);
}

// extraPct: descuento adicional (p. ej. beneficio de Booster). Todo se acumula con tope de 45 %.
function getDiscountForUser(item, userData, extraPct = 0) {
  const streakDiscount = isStreakActive(userData?.streakDays) ? 10 : 0;
  return Math.min(45, Math.max(0, num(item.discountPercent) + streakDiscount + Math.max(0, num(extraPct))));
}

function getFinalPrice(item, userData, extraPct = 0) {
  return Math.max(0, Math.round(num(item.price) * (1 - getDiscountForUser(item, userData, extraPct) / 100)));
}

const findItem = (catalog, id) => catalog.find(item => item.id === id) || null;

module.exports = { CATEGORIES, INVENTORY_ITEMS, UTILITY_ITEMS, buildCatalog, filterByCategory, getDiscountForUser, getFinalPrice, findItem };
