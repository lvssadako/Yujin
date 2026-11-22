const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Stripe = require('stripe');
const { createOrderStore } = require('../orderStore');
const { createFulfillment } = require('../paymentFulfillment');
const { createPaymentHandler } = require('../paymentHttp');
const { createStripeGateway } = require('../stripeGateway');
const { reconcileOrders } = require('../reconciler');
const { createRateLimiter } = require('../rateLimiter');
const { getProduct, PROFILE_BG_PRODUCT_ID } = require('../../../constants/paymentCatalog');

const G = '111111111'; const U = '222222222';
const WH_SECRET = 'whsec_testsecret1234567890';
const TOKEN_SECRET = 't'.repeat(40);
const BASE = 'https://pay.example.com';
const product = getProduct(PROFILE_BG_PRODUCT_ID);
const stripeSdk = new Stripe('sk_test_dummy');

const silent = { error() {}, warn() {}, info() {} };

async function setup(t, { gatewayOverrides = {}, limiter } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pay-http-'));
  const store = createOrderStore({ dir });
  const granted = []; const revoked = [];
  const fulfillment = createFulfillment({
    store, logger: silent, onGranted: async o => { granted.push(o.id); }, onRevoked: async o => { revoked.push(o.id); }
  });
  const sessions = [];
  const realGateway = createStripeGateway({ stripe: stripeSdk, webhookSecret: WH_SECRET, baseUrl: BASE });
  const gateway = {
    constructEvent: realGateway.constructEvent,
    async createCheckoutSession(order) {
      const session = { id: 'cs_test_' + 'a'.repeat(20), client_secret: 'cs_secret', status: 'open', orderId: order.id };
      sessions.push(session); return session;
    },
    async retrieveSession(id) { return sessions.find(s => s.id === id) || { id, status: 'open', payment_status: 'unpaid', client_secret: 'cs_secret' }; },
    ...gatewayOverrides
  };
  const handler = createPaymentHandler({
    store, gateway, fulfillment, tokenSecret: TOKEN_SECRET, baseUrl: BASE, publishableKey: 'pk_test_x', logger: silent,
    limiter: limiter || createRateLimiter({ limit: 1000, windowMs: 60000 })
  });
  const server = http.createServer((req, res) => { if (!handler.handle(req, res)) { res.writeHead(404); res.end('nf'); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.close(); handler.limiter.stop(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { store, handler, base, granted, revoked, sessions, fulfillment, gateway };
}

function signedEvent(event) {
  const payload = JSON.stringify(event);
  return { payload, header: stripeSdk.webhooks.generateTestHeaderString({ payload, secret: WH_SECRET }) };
}
const post = (url, body, headers = {}) => fetch(url, { method: 'POST', body, headers });
const paidEvent = (order, id = 'evt_paid_1', over = {}) => ({
  id, type: 'checkout.session.completed',
  data: { object: { id: order.sessionId, client_reference_id: order.id, metadata: { orderId: order.id }, payment_status: 'paid',
    amount_total: product.amountCents, currency: 'usd', payment_intent: 'pi_123', ...over } }
});

async function openOrder(ctx) {
  const { order } = ctx.store.ensurePendingOrder({ guildId: G, userId: U, product });
  const link = ctx.handler.createLink(order);
  const token = link.split('/pay/')[1];
  return { order, token };
}

test('webhook: sin firma, firma falsa y firma de otro secreto → 400 sin entrega', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  const live = ctx.store.getOrder(order.id);
  const { payload, header } = signedEvent(paidEvent(live));
  assert.equal((await post(`${ctx.base}/webhook/stripe`, payload)).status, 400);
  assert.equal((await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': 't=1,v1=00' })).status, 400);
  const forged = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: 'whsec_otro' });
  assert.equal((await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': forged })).status, 400);
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), false);
  assert.ok(header);
});

test('webhook: timestamp fuera de tolerancia se rechaza', async t => {
  const ctx = await setup(t);
  const payload = JSON.stringify({ id: 'evt_old', type: 'x', data: { object: {} } });
  const old = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: WH_SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.equal((await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': old })).status, 400);
});

test('webhook firmado concede una sola vez; el reintento no duplica ni avisa dos veces', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  const live = ctx.store.getOrder(order.id);
  const { payload, header } = signedEvent(paidEvent(live));
  const first = await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': header });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).status, 'granted');
  const again = await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': header });
  assert.equal((await again.json()).status, 'duplicate');
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), true);
  assert.equal(ctx.granted.length, 1);
});

test('webhook: pago diferido sin pagar no entrega; monto distinto tampoco; GET no permitido', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  const live = ctx.store.getOrder(order.id);
  for (const [id, over] of [['evt_a', { payment_status: 'unpaid' }], ['evt_b', { amount_total: 100 }], ['evt_c', { metadata: { orderId: 'otra' } }]]) {
    const { payload, header } = signedEvent(paidEvent(live, id, over));
    assert.equal((await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': header })).status, 200);
  }
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), false);
  assert.equal((await fetch(`${ctx.base}/webhook/stripe`)).status, 405);
});

test('reembolso total revoca y avisa; parcial se ignora', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  const { payload, header } = signedEvent(paidEvent(ctx.store.getOrder(order.id)));
  await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': header });
  const send = async ev => { const s = signedEvent(ev); return (await post(`${ctx.base}/webhook/stripe`, s.payload, { 'stripe-signature': s.header })).json(); };
  assert.equal((await send({ id: 'evt_p', type: 'charge.refunded', data: { object: { refunded: false, payment_intent: 'pi_123' } } })).status, 'partial_refund_ignored');
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), true);
  assert.equal((await send({ id: 'evt_f', type: 'charge.refunded', data: { object: { refunded: true, payment_intent: 'pi_123' } } })).status, 'revoked');
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), false);
  assert.equal(ctx.revoked.length, 1);
});

test('página de pago: token falso/expirado → 403 sin crear sesión; válido → 200 con CSP', async t => {
  const ctx = await setup(t);
  assert.equal((await fetch(`${ctx.base}/pay/basura`)).status, 403);
  const { token } = await openOrder(ctx);
  const bad = token.slice(0, -2) + 'AA';
  assert.equal((await fetch(`${ctx.base}/pay/${bad}`)).status, 403);
  assert.equal((await post(`${ctx.base}/pay/session/${bad}`, '', { Origin: BASE })).status, 403);
  assert.equal(ctx.sessions.length, 0);
  const ok = await fetch(`${ctx.base}/pay/${token}`);
  assert.equal(ok.status, 200);
  const csp = ok.headers.get('content-security-policy');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src 'self' https:\/\/js\.stripe\.com/);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const body = await ok.text();
  assert.match(body, /Pase de Fondo Personalizado/);
  assert.match(body, /4\.99 USD/);
  assert.doesNotMatch(body, /cs_secret|sk_test/);
});

test('el token distingue mayúsculas: no se normaliza la ruta', async t => {
  const ctx = await setup(t);
  const { token } = await openOrder(ctx);
  assert.equal((await fetch(`${ctx.base}/pay/${token}`)).status, 200);
  assert.equal((await fetch(`${ctx.base}/pay/${token.toUpperCase()}`)).status, 403);
});

test('sesión: crea una sola vez, reutiliza y rechaza otro Origin', async t => {
  const ctx = await setup(t);
  const { token } = await openOrder(ctx);
  assert.equal((await post(`${ctx.base}/pay/session/${token}`, '', { Origin: 'https://evil.example' })).status, 403);
  const a = await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  assert.equal(a.status, 200);
  assert.equal((await a.json()).clientSecret, 'cs_secret');
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  assert.equal(ctx.sessions.length, 1);
});

test('tras pagar, el mismo enlace deja de funcionar', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  const { payload, header } = signedEvent(paidEvent(ctx.store.getOrder(order.id)));
  await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': header });
  assert.equal((await fetch(`${ctx.base}/pay/${token}`)).status, 403);
});

test('/pay/return solo informa: nunca concede el pase', async t => {
  const ctx = await setup(t);
  const { token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  ctx.sessions[0].status = 'complete'; ctx.sessions[0].payment_status = 'paid';
  const r = await fetch(`${ctx.base}/pay/return?session_id=${ctx.sessions[0].id}`);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Pago recibido/);
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), false);
  assert.equal((await fetch(`${ctx.base}/pay/return?session_id=../../x`)).status, 400);
});

test('si Stripe falla al crear la sesión responde 502 sin filtrar detalles', async t => {
  const ctx = await setup(t, { gatewayOverrides: { createCheckoutSession: async () => { throw new Error('sk_test_secreto'); } } });
  const { token } = await openOrder(ctx);
  const r = await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /sk_test/);
});

test('límite de peticiones → 429, y los estáticos se sirven', async t => {
  const ctx = await setup(t, { limiter: createRateLimiter({ limit: 2, windowMs: 60000 }) });
  assert.equal((await fetch(`${ctx.base}/pay/static/pay.css`)).status, 200);
  await fetch(`${ctx.base}/pay/x`);
  assert.equal((await fetch(`${ctx.base}/pay/x`)).status, 429);
});

test('rutas ajenas no se atienden', async t => {
  const ctx = await setup(t);
  assert.equal((await fetch(`${ctx.base}/health`)).status, 404);
});

test('reconciliador acredita un pago cuyo webhook se perdió y es idempotente con el webhook tardío', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  const live = ctx.store.getOrder(order.id);
  Object.assign(ctx.sessions[0], { status: 'complete', payment_status: 'paid', client_reference_id: live.id,
    metadata: { orderId: live.id }, amount_total: product.amountCents, currency: 'usd', payment_intent: 'pi_123' });
  const summary = await reconcileOrders({ store: ctx.store, gateway: ctx.gateway, fulfillment: ctx.fulfillment, logger: silent });
  assert.equal(summary.granted, 1);
  assert.equal(ctx.store.hasEntitlement(G, U, PROFILE_BG_PRODUCT_ID), true);
  const { payload, header } = signedEvent(paidEvent(live));
  assert.equal((await (await post(`${ctx.base}/webhook/stripe`, payload, { 'stripe-signature': header })).json()).status, 'duplicate');
  assert.equal(ctx.granted.length, 1);
  assert.equal((await reconcileOrders({ store: ctx.store, gateway: ctx.gateway, fulfillment: ctx.fulfillment, logger: silent })).checked, 0);
});

test('reconciliador marca expirada una sesión caducada y tolera errores de Stripe', async t => {
  const ctx = await setup(t);
  const { order, token } = await openOrder(ctx);
  await post(`${ctx.base}/pay/session/${token}`, '', { Origin: BASE });
  ctx.sessions[0].status = 'expired';
  await reconcileOrders({ store: ctx.store, gateway: ctx.gateway, fulfillment: ctx.fulfillment, logger: silent });
  assert.equal(ctx.store.getOrder(order.id).status, 'expired');
  const boom = { retrieveSession: async () => { throw new Error('red'); } };
  const { order: o2 } = ctx.store.ensurePendingOrder({ guildId: G, userId: '333333333', product });
  ctx.store.attachSession(o2.id, 'cs_test_zzz');
  const s = await reconcileOrders({ store: ctx.store, gateway: boom, fulfillment: ctx.fulfillment, logger: silent });
  assert.equal(s.errors, 1);
});
