const { isBooster } = require('../profile/backgroundAccess');

// Beneficios de Booster. Todo es configurable en config.boosterPerks (valores fuera de rango se recortan).
const DEFAULT_PERKS = Object.freeze({ enabled: true, xpBonus: 0.2, coinBonus: 0.5, dailyBonus: 0.25, shopDiscount: 10 });
const LIMITS = Object.freeze({ xpBonus: [0, 2], coinBonus: [0, 3], dailyBonus: [0, 3], shopDiscount: [0, 45] });
const NO_PERKS = Object.freeze({ enabled: false, xpBonus: 0, coinBonus: 0, dailyBonus: 0, shopDiscount: 0 });

const clamp = (value, [min, max], fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function resolvePerks(cfg = {}) {
  const raw = cfg?.boosterPerks && typeof cfg.boosterPerks === 'object' ? cfg.boosterPerks : {};
  if (raw.enabled === false) return NO_PERKS;
  return {
    enabled: true,
    xpBonus: clamp(raw.xpBonus, LIMITS.xpBonus, DEFAULT_PERKS.xpBonus),
    coinBonus: clamp(raw.coinBonus, LIMITS.coinBonus, DEFAULT_PERKS.coinBonus),
    dailyBonus: clamp(raw.dailyBonus, LIMITS.dailyBonus, DEFAULT_PERKS.dailyBonus),
    shopDiscount: Math.round(clamp(raw.shopDiscount, LIMITS.shopDiscount, DEFAULT_PERKS.shopDiscount))
  };
}

/** Beneficios que le corresponden a un miembro (cero si no es Booster). */
const perksFor = (member, cfg) => (isBooster(member) ? resolvePerks(cfg) : NO_PERKS);

/** amount * (1 + bonus), entero y sin bajar nunca del valor original (un bonus pequeño no se pierde por redondeo). */
const withBonus = (amount, bonus) => Math.max(Math.floor(amount), Math.round(amount * (1 + (Number(bonus) || 0))));

module.exports = { DEFAULT_PERKS, LIMITS, NO_PERKS, resolvePerks, perksFor, withBonus };
