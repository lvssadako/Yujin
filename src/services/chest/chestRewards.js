// Reglas de recompensa de los cofres: valor de duplicados y garantía de rareza ("pity").
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

// Monedas por cada copia repetida canjeada (el cofre cuesta 1000).
const DUPLICATE_VALUE = Object.freeze({ common: 300, rare: 600, epic: 1500, legendary: 4000 });

// Cada PITY_THRESHOLD cofres abiertos sin conseguir épico o mejor, el siguiente lo garantiza.
const PITY_THRESHOLD = 30;
const PITY_MIN_RARITY = 'epic';

const isHighRarity = rarity => RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(PITY_MIN_RARITY);
const valueOf = rarity => DUPLICATE_VALUE[rarity] ?? DUPLICATE_VALUE.common;

const pityCount = user => Math.max(0, Math.floor(Number(user?.chestPity) || 0));
const shouldForcePity = user => pityCount(user) >= PITY_THRESHOLD - 1;

/** Actualiza el contador tras una apertura. Devuelve true si el cofre fue épico o mejor. */
function registerOpen(user, badge) {
  const high = isHighRarity(badge?.rarity);
  user.chestPity = high ? 0 : pityCount(user) + 1;
  return high;
}

/**
 * Canjea las copias repetidas (stack > 1) dejando 1 de cada una. Devuelve { coins, items }.
 * No toca las insignias que el usuario no tiene ni las que ya no existen en el catálogo.
 * `onlyId` limita el canje a una insignia.
 */
function convertDuplicates(user, catalog, onlyId = null) {
  const items = [];
  let coins = 0;
  const stacks = user.badgeStacks || {};
  for (const [id, stack] of Object.entries(stacks)) {
    if (onlyId && id !== onlyId) continue;
    const badge = catalog?.[id];
    const extra = Math.floor(Number(stack) || 0) - 1;
    if (!badge || extra < 1 || !(user.earnedBadges || []).includes(id)) continue;
    const value = valueOf(badge.rarity) * extra;
    coins += value;
    items.push({ id, name: badge.name, icon: badge.icon, rarity: badge.rarity || 'common', copies: extra, value });
    stacks[id] = 1;
  }
  return { coins, items };
}

/** Cuánto se obtendría canjeando ahora (sin modificar nada). */
function previewDuplicates(user, catalog) {
  const clone = { badgeStacks: { ...(user.badgeStacks || {}) }, earnedBadges: user.earnedBadges || [] };
  return convertDuplicates(clone, catalog);
}

module.exports = {
  RARITY_ORDER, DUPLICATE_VALUE, PITY_THRESHOLD, PITY_MIN_RARITY,
  isHighRarity, pityCount, shouldForcePity, registerOpen, convertDuplicates, previewDuplicates
};
