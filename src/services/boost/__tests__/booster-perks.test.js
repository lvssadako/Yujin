const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePerks, perksFor, withBonus, DEFAULT_PERKS, NO_PERKS } = require('../boosterPerks');
const { getDiscountForUser, getFinalPrice } = require('../../shop/shopCatalog');
const { previewDailyReward } = require('../../../utils/dailyView');

const booster = { premiumSince: new Date(), guild: { roles: {} }, roles: { cache: new Map() } };
const plain = { premiumSince: null, guild: { roles: {} }, roles: { cache: new Map() } };

test('valores por defecto: paquete completo acordado', () => {
  const p = resolvePerks({});
  assert.deepEqual([p.xpBonus, p.coinBonus, p.dailyBonus, p.shopDiscount], [0.2, 0.5, 0.25, 10]);
  assert.deepEqual(DEFAULT_PERKS.enabled, true);
});

test('config: se puede ajustar, se recorta a límites y se puede apagar', () => {
  const p = resolvePerks({ boosterPerks: { xpBonus: 0.1, coinBonus: 99, dailyBonus: -5, shopDiscount: 200 } });
  assert.deepEqual([p.xpBonus, p.coinBonus, p.dailyBonus, p.shopDiscount], [0.1, 3, 0, 45]);
  assert.equal(resolvePerks({ boosterPerks: { enabled: false } }), NO_PERKS);
  assert.equal(resolvePerks({ boosterPerks: { xpBonus: 'abc' } }).xpBonus, 0.2); // inválido → por defecto
  assert.equal(resolvePerks(null).xpBonus, 0.2);
});

test('solo los Boosters reciben beneficios', () => {
  assert.equal(perksFor(booster, {}).xpBonus, 0.2);
  assert.equal(perksFor(plain, {}), NO_PERKS);
  assert.equal(perksFor(null, {}), NO_PERKS);
  const role = { id: 'r' };
  assert.equal(perksFor({ ...plain, guild: { roles: { premiumSubscriberRole: role } }, roles: { cache: new Map([['r', role]]) } }, {}).coinBonus, 0.5);
});

test('withBonus: entero, nunca baja y no se pierde por redondeo', () => {
  assert.equal(withBonus(100, 0.5), 150);
  assert.equal(withBonus(1, 0.5), 2);
  assert.equal(withBonus(3, 0.5), 5);
  assert.equal(withBonus(250, 0.25), 313);
  assert.equal(withBonus(100, 0), 100);
  assert.equal(withBonus(100, -1), 100);
  assert.equal(withBonus(100, 'x'), 100);
});

test('tienda: el descuento de Booster se suma al de racha con tope de 45 %', () => {
  const item = { price: 1000, discountPercent: 0 };
  assert.equal(getFinalPrice(item, { streakDays: 0 }, 10), 900);
  assert.equal(getFinalPrice(item, { streakDays: 10 }, 10), 800);
  assert.equal(getDiscountForUser({ price: 1, discountPercent: 30 }, { streakDays: 10 }, 45), 45);
  assert.equal(getFinalPrice(item, {}, -50), 1000);
});

test('daily: el bonus de Booster sube la base pero el bonus de racha sigue igual', () => {
  const base = withBonus(250, 0.25);
  const r = previewDailyReward({ streak: 5, lastDailyDay: 99, today: 100, base });
  assert.equal(r.base, 313);
  assert.equal(r.bonus, 50);
  assert.equal(r.total, 363);
});

test('el comando de beneficios responde y refleja el estado de Booster', () => {
  const cmd = require('../../../commands/boost/boostperks');
  assert.match(JSON.stringify(cmd.buildEmbed(booster).toJSON()), /Eres Booster/);
  assert.match(JSON.stringify(cmd.buildEmbed(plain).toJSON()), /Server Boost/);
});
