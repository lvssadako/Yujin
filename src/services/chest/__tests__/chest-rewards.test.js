const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../chestRewards');
const { rollBadge } = require('../../../utils/badgeRoller');

const catalog = {
  c1: { id: 'c1', name: 'Común', icon: '⚪', rarity: 'common', type: 'shop' },
  r1: { id: 'r1', name: 'Rara', icon: '🔵', rarity: 'rare', type: 'shop' },
  e1: { id: 'e1', name: 'Épica', icon: '🟣', rarity: 'epic', type: 'shop' },
  l1: { id: 'l1', name: 'Legendaria', icon: '🟡', rarity: 'legendary', type: 'shop' },
  a1: { id: 'a1', name: 'Logro', rarity: 'rare', type: 'achievement' }
};

test('canje: deja 1 copia, paga por rareza y por cada copia extra', () => {
  const user = { earnedBadges: ['c1', 'e1', 'l1'], badgeStacks: { c1: 4, e1: 2, l1: 1 } };
  const { coins, items } = R.convertDuplicates(user, catalog);
  assert.equal(coins, 3 * 300 + 1 * 1500);
  assert.deepEqual(user.badgeStacks, { c1: 1, e1: 1, l1: 1 });
  assert.equal(items.length, 2);
  assert.deepEqual(R.convertDuplicates(user, catalog), { coins: 0, items: [] }); // idempotente
});

test('canje: ignora insignias que no tiene, que ya no existen o con stack inválido', () => {
  const user = { earnedBadges: ['c1'], badgeStacks: { c1: 'x', fantasma: 5, e1: 3, r1: -4 } };
  assert.equal(R.convertDuplicates(user, catalog).coins, 0);
  assert.equal(R.convertDuplicates({ earnedBadges: ['c1'], badgeStacks: { c1: 3 } }, catalog, 'e1').coins, 0);
  assert.equal(R.convertDuplicates({ earnedBadges: ['c1'], badgeStacks: { c1: 3 } }, catalog, 'c1').coins, 600);
  assert.equal(R.convertDuplicates({}, catalog).coins, 0);
});

test('vista previa no modifica los stacks', () => {
  const user = { earnedBadges: ['r1'], badgeStacks: { r1: 3 } };
  assert.equal(R.previewDuplicates(user, catalog).coins, 1200);
  assert.equal(user.badgeStacks.r1, 3);
});

test('garantía: se activa en el cofre 30 y se reinicia con épico o mejor', () => {
  const user = {};
  for (let i = 0; i < R.PITY_THRESHOLD - 1; i++) {
    assert.equal(R.shouldForcePity(user), false, 'cofre ' + (i + 1));
    R.registerOpen(user, catalog.c1);
  }
  assert.equal(R.shouldForcePity(user), true);
  R.registerOpen(user, catalog.e1);
  assert.equal(user.chestPity, 0);
  assert.equal(R.shouldForcePity(user), false);
  R.registerOpen(user, catalog.l1);
  assert.equal(user.chestPity, 0);
  assert.equal(R.pityCount({ chestPity: -5 }), 0);
  assert.equal(R.pityCount({ chestPity: 'x' }), 0);
});

test('simulación: nunca pasan más de 30 cofres seguidos sin épico o mejor', () => {
  const profiles = { badges: catalog };
  const user = {};
  let streak = 0; let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const badge = rollBadge(profiles, R.shouldForcePity(user) ? { minRarity: R.PITY_MIN_RARITY } : {});
    const high = R.registerOpen(user, badge);
    streak = high ? 0 : streak + 1;
    worst = Math.max(worst, streak);
  }
  assert.ok(worst <= R.PITY_THRESHOLD - 1, 'racha máxima sin épica: ' + worst);
});

test('rollBadge con minRarity solo da épicas o legendarias; sin ellas cae al pool normal', () => {
  const profiles = { badges: catalog };
  for (let i = 0; i < 300; i++) assert.ok(['epic', 'legendary'].includes(rollBadge(profiles, { minRarity: 'epic' }).rarity));
  const onlyCommon = { badges: { c1: catalog.c1 } };
  assert.equal(rollBadge(onlyCommon, { minRarity: 'epic' }).id, 'c1');
  assert.equal(rollBadge({ badges: {} }, { minRarity: 'epic' }), null);
  const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(rollBadge(profiles).rarity);
  assert.ok(seen.has('common'));
});

test('el cofre exporta compra y canje (el botón de compra dependía de handleChestBuy)', () => {
  const chest = require('../../../commands/economy/chest');
  for (const name of ['handleChestOpen', 'handleChestBuy', 'handleChestDupes']) assert.equal(typeof chest[name], 'function', name);
  assert.ok(chest.data.toJSON().options.some(o => o.name === 'canjear'));
});
