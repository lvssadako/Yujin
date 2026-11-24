const RARITIES = {
  common:     { weight: 75, emoji: '⚪', color: 0x95a5a6 },
  rare:       { weight: 18, emoji: '🔵', color: 0x3498db },
  epic:       { weight: 6,  emoji: '🟣', color: 0x9b59b6 },
  legendary:  { weight: 1,  emoji: '🟡', color: 0xf39c12 }
};

const { secureRandom, secureChoice } = require('./cryptoRandom');

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

// minRarity: garantiza esa rareza o superior (usado por la garantía de los cofres).
function rollBadge(profiles, { minRarity = null } = {}) {
  let allBadges = Object.values(profiles.badges || {}).filter(b => b.type === 'shop');
  if (!allBadges.length) return null;

  const minIndex = minRarity ? RARITY_ORDER.indexOf(minRarity) : -1;
  if (minIndex > 0) {
    const eligible = allBadges.filter(b => RARITY_ORDER.indexOf(b.rarity) >= minIndex);
    if (eligible.length) {
      // Solo compiten las rarezas permitidas, con sus pesos normales (épica 6 : legendaria 1).
      const weights = Object.entries(RARITIES).filter(([r]) => RARITY_ORDER.indexOf(r) >= minIndex);
      let pick = secureRandom() * weights.reduce((sum, [, d]) => sum + d.weight, 0);
      let rarity = weights[0][0];
      for (const [r, d] of weights) { pick -= d.weight; if (pick <= 0) { rarity = r; break; } }
      const pool = eligible.filter(b => b.rarity === rarity);
      return secureChoice(pool.length ? pool : eligible);
    }
  }

  const totalWeight = Object.values(RARITIES).reduce((sum, r) => sum + r.weight, 0);
  let random = secureRandom() * totalWeight;
  let selectedRarity = 'common';

  for (const [rarity, data] of Object.entries(RARITIES)) {
    random -= data.weight;
    if (random <= 0) {
      selectedRarity = rarity;
      break;
    }
  }

  let pool = allBadges.filter(b => b.rarity === selectedRarity);

  let attempts = 0;
  while (!pool.length && attempts < 6) {
    random = secureRandom() * totalWeight;
    for (const [rarity, data] of Object.entries(RARITIES)) {
      random -= data.weight;
      if (random <= 0) {
        selectedRarity = rarity;
        break;
      }
    }
    pool = allBadges.filter(b => b.rarity === selectedRarity);
    attempts++;
  }

  if (!pool.length) {
    pool = allBadges.filter(b => b.rarity === 'common');
  }
  if (!pool.length) pool = allBadges;
  if (!pool.length) return null;

  return secureChoice(pool);
}

module.exports = { rollBadge, RARITIES };