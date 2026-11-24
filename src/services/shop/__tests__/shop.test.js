const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildCatalog, filterByCategory, getFinalPrice, getDiscountForUser, findItem } = require('../shopCatalog');
const { createPurchaseService } = require('../purchaseService');
const { createRoleLeaseStore, sweepExpiredLeases, DAY_MS } = require('../roleLeaseStore');
const { addShopRole, removeShopRole, slug, MAX_SHOP_ROLES } = require('../shopRolesAdmin');
const { buildCatalogView } = require('../../../utils/shopView');

const G = '111111111'; const U = '222222222'; const ROLE = '333333333';
const cfg = {
  xpBoosts: { boost1h: { name: 'Boost 1h', price: 1000, multiplier: 2, durationMs: 3600000 } },
  shopRoles: [{ id: 'vip_color', name: 'Color VIP', price: 2500, roleId: ROLE, days: 7 }]
};

test('catálogo: incluye boosts, packs, objetos, roles y utilidad sin ids duplicados', () => {
  const catalog = buildCatalog(cfg);
  const cats = new Set(catalog.map(i => i.category));
  for (const c of ['boosts', 'items', 'roles', 'utility']) assert.ok(cats.has(c), c);
  assert.equal(new Set(catalog.map(i => i.id)).size, catalog.length);
  assert.equal(findItem(catalog, 'role_vip_color').kind, 'role');
  assert.equal(filterByCategory(catalog, 'items').length, 3);
  assert.equal(filterByCategory(catalog, 'inexistente').length, catalog.length);
  assert.ok(buildCatalog({}).length > 0);
});

test('precio: descuento por racha activa y tope', () => {
  const item = { price: 1000, discountPercent: 0 };
  assert.equal(getFinalPrice(item, { streakDays: 0 }), 1000);
  assert.equal(getFinalPrice(item, { streakDays: 10 }), 900);
  assert.equal(getDiscountForUser({ price: 1, discountPercent: 90 }, { streakDays: 10 }), 45);
});

function harness({ coins = 10000, validRole = true, missionsFree = true, addRoleFails = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-'));
  const calls = { boosts: [], items: [], rerolls: 0 };
  let wallet = coins; let clock = 1_700_000_000_000;
  const leases = createRoleLeaseStore({ dir, now: () => clock });
  const svc = createPurchaseService({
    economy: {
      getBalance: () => ({ coins: wallet }),
      subtractCoins: (g, u, n) => (wallet >= n ? (wallet -= n, true) : false),
      addCoins: (g, u, n) => { wallet += n; }, addItem: (g, u, id) => calls.items.push(id)
    },
    grantBoost: (g, u, b) => calls.boosts.push(b.id), leases,
    rerollMissions: () => { calls.rerolls += 1; }, missionsUntouched: () => missionsFree,
    validateRole: () => ({ valid: validRole })
  });
  const member = { id: U, roles: { cache: new Map(), add: async id => { if (addRoleFails) throw new Error('perm'); calls.role = id; } } };
  const guild = { id: G };
  const catalog = buildCatalog(cfg);
  const buy = id => svc.purchase({ guild, member, userId: U, item: findItem(catalog, id), catalog, cfg, userData: { streakDays: 0 } });
  return { buy, calls, leases, wallet: () => wallet, tick: ms => { clock += ms; }, dir, clock: () => clock };
}

test('compra de objeto: cobra y entrega al inventario', async t => {
  const h = harness(); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  const r = await h.buy('escudo');
  assert.equal(r.ok, true);
  assert.deepEqual(h.calls.items, ['escudo']);
  assert.equal(h.wallet(), 5000);
});

test('compra sin saldo no cobra ni entrega', async t => {
  const h = harness({ coins: 100 }); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  const r = await h.buy('escudo');
  assert.equal(r.ok, false);
  assert.equal(h.calls.items.length, 0);
  assert.equal(h.wallet(), 100);
});

test('producto inexistente se rechaza con mensaje claro', async t => {
  const h = harness(); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  const r = await h.buy('no_existe');
  assert.equal(r.ok, false); assert.match(r.error, /No encontré/);
});

test('boost: se entrega con el multiplicador del catálogo', async t => {
  const h = harness(); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  assert.equal((await h.buy('boost1h')).ok, true);
  assert.deepEqual(h.calls.boosts, ['boost1h']);
});

test('rol: cobra, entrega y registra el vencimiento; comprarlo otra vez extiende', async t => {
  const h = harness(); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  const r = await h.buy('role_vip_color');
  assert.equal(r.ok, true);
  assert.equal(h.calls.role, ROLE);
  assert.equal(h.wallet(), 7500);
  const first = h.leases.get(G, U, ROLE).expiresAt;
  assert.equal(first, h.clock() + 7 * DAY_MS);
  await h.buy('role_vip_color');
  assert.equal(h.leases.get(G, U, ROLE).expiresAt, first + 7 * DAY_MS);
});

test('rol: si Discord falla se reembolsa y se revierte el vencimiento', async t => {
  const h = harness({ addRoleFails: true }); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  const r = await h.buy('role_vip_color');
  assert.equal(r.ok, false); assert.match(r.error, /no se te cobró nada/);
  assert.equal(h.wallet(), 10000);
  assert.equal(h.leases.get(G, U, ROLE), null);
});

test('rol: rol no gestionable se rechaza antes de cobrar', async t => {
  const h = harness({ validRole: false }); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  const r = await h.buy('role_vip_color');
  assert.equal(r.ok, false);
  assert.equal(h.wallet(), 10000);
});

test('reroll: solo con misiones sin tocar y antes de cobrar', async t => {
  const blocked = harness({ missionsFree: false }); t.after(() => fs.rmSync(blocked.dir, { recursive: true, force: true }));
  const r = await blocked.buy('reroll_misiones');
  assert.equal(r.ok, false); assert.equal(blocked.wallet(), 10000); assert.equal(blocked.calls.rerolls, 0);
  const free = harness(); t.after(() => fs.rmSync(free.dir, { recursive: true, force: true }));
  assert.equal((await free.buy('reroll_misiones')).ok, true);
  assert.equal(free.calls.rerolls, 1); assert.equal(free.wallet(), 9200);
});

test('barrido: retira solo los roles vencidos y limpia el registro (idempotente)', async t => {
  const h = harness(); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  await h.buy('role_vip_color');
  const removed = [];
  const member = { roles: { cache: new Map([[ROLE, {}]]), remove: async id => removed.push(id) } };
  const client = { guilds: { cache: new Map([[G, { members: { fetch: async () => member } }]]) } };
  assert.equal(await sweepExpiredLeases({ store: h.leases, client }), 0);
  h.tick(8 * DAY_MS);
  assert.equal(await sweepExpiredLeases({ store: h.leases, client }), 1);
  assert.deepEqual(removed, [ROLE]);
  assert.equal(await sweepExpiredLeases({ store: h.leases, client }), 0);
  assert.equal(h.leases.get(G, U, ROLE), null);
});

test('barrido: miembro que salió o servidor ausente no rompe', async t => {
  const h = harness(); t.after(() => fs.rmSync(h.dir, { recursive: true, force: true }));
  await h.buy('role_vip_color'); h.tick(9 * DAY_MS);
  const gone = { guilds: { cache: new Map([[G, { members: { fetch: async () => { throw new Error('Unknown Member'); } } }]]) } };
  assert.equal(await sweepExpiredLeases({ store: h.leases, client: gone }), 1);
  await h.buy('role_vip_color'); h.tick(9 * DAY_MS);
  assert.equal(await sweepExpiredLeases({ store: h.leases, client: { guilds: { cache: new Map() } } }), 0);
});

test('rol permanente (0 días) no crea vencimiento', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const leases = createRoleLeaseStore({ dir });
  assert.deepEqual(leases.grant({ guildId: G, userId: U, roleId: ROLE, days: 0 }), { permanent: true, expiresAt: null });
  assert.equal(leases.get(G, U, ROLE), null);
  assert.throws(() => leases.grant({ guildId: 'x', userId: U, roleId: ROLE, days: 1 }));
});

test('administración: agrega, reemplaza, valida y quita', () => {
  let r = addShopRole([], { name: 'Color Mágico ✨', price: 3000, days: 30, roleId: ROLE });
  assert.equal(r.entry.id, 'color_magico');
  r = addShopRole(r.roles, { name: 'Color Mágico ✨', price: 4000, days: 30, roleId: ROLE });
  assert.equal(r.replaced, true); assert.equal(r.roles.length, 1); assert.equal(r.roles[0].price, 4000);
  for (const bad of [{ name: '!!', price: 10, days: 1, roleId: ROLE }, { name: 'ok_rol', price: 0, days: 1, roleId: ROLE },
    { name: 'ok_rol', price: 10, days: 400, roleId: ROLE }, { name: 'ok_rol', price: 1.5, days: 1, roleId: ROLE }, { name: 'ok_rol', price: 10, days: 1, roleId: 'x' }]) {
    assert.equal(addShopRole([], bad).ok, false, JSON.stringify(bad));
  }
  const full = Array.from({ length: MAX_SHOP_ROLES }, (_, i) => ({ id: 'r' + String(i).padStart(3, '0'), name: 'r', price: 1, roleId: ROLE, days: 1 }));
  assert.equal(addShopRole(full, { name: 'nuevo', price: 10, days: 1, roleId: ROLE }).ok, false);
  assert.equal(removeShopRole(r.roles, 'color_magico').ok, true);
  assert.equal(removeShopRole(r.roles, 'nada').ok, false);
  assert.equal(slug('Ñandú Épico'), 'nandu_epico');
});

test('vista: categorías, paginación y límites de componentes', () => {
  const catalog = buildCatalog(cfg);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 'x' + i, category: 'boosts', kind: 'boost', name: 'Boost ' + i, price: 10, multiplier: 2, durationMs: 3600000, description: 'd', rarity: 'common' }));
  for (const [list, cat, page] of [[catalog, 'all', 0], [catalog, 'roles', 0], [catalog, 'utility', 0], [many, 'boosts', 1], [many, 'boosts', 99], [[], 'all', 0]]) {
    const v = buildCatalogView(list, { streakDays: 0 }, getDiscountForUser, getFinalPrice, page, U, cat);
    assert.ok(v.components.length <= 5, 'filas');
    for (const row of v.components) { assert.ok(row.components.length <= 5); for (const b of row.components) assert.ok(b.data.custom_id.length <= 100); }
    const json = v.embed.toJSON();
    const fields = json.fields || [];
    assert.ok(fields.length <= 8);
    for (const f of fields) assert.ok(f.value.length <= 1024);
  }
  const roles = buildCatalogView(catalog, { streakDays: 0 }, getDiscountForUser, getFinalPrice, 0, U, 'roles');
  assert.equal(roles.items.length, 1);
  assert.match(JSON.stringify(roles.embed.toJSON()), /Color VIP/);
});

// ---- Parches de auditoría ----
const { buttonLabel } = require('../../../utils/shopView');
const { MAX_ITEM_ID_LENGTH } = require('../shopCatalog');

test('botón de la tienda: solo se quita el emoji inicial, nunca la primera palabra', () => {
  assert.equal(buttonLabel('🛡️ Escudo Anti-Robo'), 'Escudo Anti-Robo');
  assert.equal(buttonLabel('Boost 1h'), 'Boost 1h');
  assert.equal(buttonLabel('Pack XP 3h'), 'Pack XP 3h');
  assert.equal(buttonLabel('🎭 Color VIP'), 'Color VIP');
  assert.equal(buttonLabel('⭐ ✨ Oferta'), 'Oferta');
  assert.equal(buttonLabel('🔥'), '🔥'); // solo emoji: se conserva
  assert.equal(buttonLabel(''), '');
});

test('catálogo: los productos con id demasiado largo se descartan (el botón no cabría en 100 caracteres)', () => {
  const long = 'x'.repeat(MAX_ITEM_ID_LENGTH + 1);
  const ok = 'y'.repeat(MAX_ITEM_ID_LENGTH);
  const catalog = buildCatalog({ xpBoosts: { [long]: { name: 'Largo', price: 10, multiplier: 2, durationMs: 1000 }, [ok]: { name: 'Justo', price: 10, multiplier: 2, durationMs: 1000 } } });
  assert.equal(findItem(catalog, long), null);
  assert.ok(findItem(catalog, ok));
  const view = buildCatalogView(catalog, { streakDays: 0 }, getDiscountForUser, getFinalPrice, 0, U, 'boosts');
  for (const row of view.components) for (const b of row.components) assert.ok(b.data.custom_id.length <= 100);
});

test('compra de rol: exige que el rol no sea peligroso (se valida al comprar, no solo al configurar)', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shop-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let received = null; let wallet = 10000;
  const svc = createPurchaseService({
    economy: { getBalance: () => ({ coins: wallet }), subtractCoins: (g, u, n) => { wallet -= n; return true; }, addCoins: (g, u, n) => { wallet += n; }, addItem() {} },
    grantBoost() {}, leases: createRoleLeaseStore({ dir }), rerollMissions() {}, missionsUntouched: () => true,
    validateRole: (guild, roleId, ctx, options) => { received = options; return { valid: !options?.rejectDangerous }; }
  });
  const catalog = buildCatalog(cfg);
  const member = { id: U, roles: { cache: new Map(), add: async () => {} } };
  const r = await svc.purchase({ guild: { id: G }, member, userId: U, item: findItem(catalog, 'role_vip_color'), catalog, cfg, userData: {} });
  assert.deepEqual(received, { rejectDangerous: true });
  assert.equal(r.ok, false);
  assert.equal(wallet, 10000); // no se cobró
});

test('botones de la tienda fuera de un servidor responden sin lanzar', async () => {
  const shop = require('../../../commands/economy/shop');
  const replies = [];
  for (const customId of ['shop_buy_escudo', 'shop_cat_222222222222222222_items', 'shop_page_222222222222222222_all_1']) {
    await shop.handleButton({ customId, guild: null, guildId: null, user: { id: '222222222222222222' }, reply: async p => replies.push(p) });
  }
  assert.equal(replies.length, 3);
  for (const r of replies) assert.match(r.content, /solo funciona dentro de un servidor/);
});
