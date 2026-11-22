const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOrderStore, ORDER_TTL_MS } = require('../orderStore');
const { getProduct, PROFILE_BG_PRODUCT_ID } = require('../../../constants/paymentCatalog');

const G = '111111111'; const U = '222222222';
const product = getProduct(PROFILE_BG_PRODUCT_ID);

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let clock = 1_700_000_000_000;
  const store = createOrderStore({ dir, now: () => clock });
  return { store, dir, tick: ms => { clock += ms; } };
}
const pay = (store, order, over = {}) => store.applyPayment({
  eventId: 'evt_1', orderId: order.id, sessionId: 'cs_test_abc', amountTotal: product.amountCents,
  currency: 'USD', paymentIntentId: 'pi_1', ...over
});
function pending(store) {
  const { order } = store.ensurePendingOrder({ guildId: G, userId: U, product });
  store.attachSession(order.id, 'cs_test_abc');
  return order;
}

test('crear orden es idempotente por usuario y producto', t => {
  const { store } = fixture(t);
  const a = store.ensurePendingOrder({ guildId: G, userId: U, product });
  const b = store.ensurePendingOrder({ guildId: G, userId: U, product });
  assert.equal(a.status, 'created');
  assert.equal(b.status, 'pending');
  assert.equal(a.order.id, b.order.id);
});

test('identidades inválidas se rechazan', t => {
  const { store } = fixture(t);
  assert.throws(() => store.ensurePendingOrder({ guildId: 'x', userId: U, product }));
  assert.throws(() => store.grantManual({ guildId: G, userId: U, productId: '../x', staffId: '1' }));
});

test('pago: concede una sola vez aunque el evento se repita o llegue otro evento de la misma orden', t => {
  const { store } = fixture(t);
  const order = pending(store);
  assert.equal(pay(store, order).status, 'granted');
  assert.equal(store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), true);
  assert.equal(pay(store, order).status, 'duplicate');
  assert.equal(pay(store, order, { eventId: 'evt_2' }).status, 'duplicate');
});

test('pago: monto, moneda o sesión distintos no entregan y marcan la orden', t => {
  for (const over of [{ amountTotal: 1 }, { currency: 'mxn' }, { sessionId: 'cs_test_other' }]) {
    const { store } = fixture(t);
    const order = pending(store);
    assert.equal(pay(store, order, over).status, 'mismatch');
    assert.equal(store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), false);
    assert.equal(store.getOrder(order.id).status, 'flagged');
  }
});

test('pago: orden desconocida no entrega', t => {
  const { store } = fixture(t);
  assert.equal(pay(store, { id: 'nope' }).status, 'unknown_order');
});

test('pago legítimo con la orden ya expirada localmente igual se acredita', t => {
  const { store, tick } = fixture(t);
  const order = pending(store);
  tick(ORDER_TTL_MS + 1);
  store.ensurePendingOrder({ guildId: G, userId: '333333333', product }); // fuerza el barrido de expiradas
  assert.equal(store.getOrder(order.id).status, 'expired');
  assert.equal(pay(store, order).status, 'granted');
});

test('quien ya tiene el pase no genera otra orden', t => {
  const { store } = fixture(t);
  pay(store, pending(store));
  assert.equal(store.ensurePendingOrder({ guildId: G, userId: U, product }).status, 'owned');
});

test('reembolso y disputa revocan el pase una sola vez', t => {
  const { store } = fixture(t);
  pay(store, pending(store));
  assert.equal(store.applyReversal({ eventId: 'evt_r', paymentIntentId: 'pi_1', newStatus: 'refunded' }).status, 'revoked');
  assert.equal(store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), false);
  assert.equal(store.applyReversal({ eventId: 'evt_r', paymentIntentId: 'pi_1', newStatus: 'refunded' }).status, 'duplicate');
  assert.equal(store.applyReversal({ eventId: 'evt_d', paymentIntentId: 'pi_x', newStatus: 'disputed' }).status, 'unknown_order');
});

test('tras revocar se puede volver a comprar', t => {
  const { store } = fixture(t);
  pay(store, pending(store));
  store.applyReversal({ eventId: 'evt_r', paymentIntentId: 'pi_1', newStatus: 'refunded' });
  assert.equal(store.ensurePendingOrder({ guildId: G, userId: U, product }).status, 'created');
});

test('concesión y revocación manual del staff', t => {
  const { store } = fixture(t);
  const key = { guildId: G, userId: U, productId: PROFILE_BG_PRODUCT_ID };
  assert.equal(store.grantManual({ ...key, staffId: '9' }).status, 'granted');
  assert.equal(store.grantManual({ ...key, staffId: '9' }).status, 'already_owned');
  assert.equal(store.revokeManual(key).status, 'revoked');
  assert.equal(store.revokeManual(key).status, 'not_owned');
});

test('el estado sobrevive a un reinicio (nueva instancia sobre el mismo directorio)', t => {
  const { store, dir } = fixture(t);
  pay(store, pending(store));
  const reopened = createOrderStore({ dir });
  assert.equal(reopened.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), true);
  assert.equal(reopened.applyPayment({ eventId: 'evt_1', orderId: 'x', sessionId: 's', amountTotal: 1, currency: 'usd' }).status, 'duplicate');
});

test('un archivo corrupto bloquea en lugar de recrearse vacío', t => {
  const { store } = fixture(t);
  pending(store);
  fs.writeFileSync(store.filePath, '{ corrupto');
  assert.throws(() => store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID));
});
