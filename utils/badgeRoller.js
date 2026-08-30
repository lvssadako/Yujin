const RARITIES = {
  common:     { weight: 75, emoji: '⚪', color: 0x95a5a6 },
  rare:       { weight: 18, emoji: '🔵', color: 0x3498db },
  epic:       { weight: 6,  emoji: '🟣', color: 0x9b59b6 },
  legendary:  { weight: 1,  emoji: '🟡', color: 0xf39c12 }
};

function rollBadge(profiles) {
  const allBadges = Object.values(profiles.badges || {}).filter(b => b.type === 'shop');
  if (!allBadges.length) return null;

  const totalWeight = Object.values(RARITIES).reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
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
    random = Math.random() * totalWeight;
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

  return pool[Math.floor(Math.random() * pool.length)];
}

module.exports = { rollBadge, RARITIES };