const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { withLock } = require('../economy/economyLock');

const ORDER_TTL_MS = 30 * 60 * 1000;
const EVENT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 5000;
const ID_RE = /^\d{5,25}$/;
const PRODUCT_RE = /^[a-z0-9_]{3,40}$/;

const emptyState = () => ({ version: 1, orders: {}, entitlements: {}, events: {} });
const keyOf = (guildId, userId, productId) => `${guildId}:${userId}:${productId}`;

function assertIdentity(guildId, userId, productId) {
  if (!ID_RE.test(String(guildId)) || !ID_RE.test(String(userId)) || !PRODUCT_RE.test(String(productId))) {
    throw new Error('Invalid order identity');
  }
}

/**
 * Libro de órdenes + entitlements. Todo cambio ocurre dentro de withLock (síncrono)
 * y se publica con writeJsonAtomic; los eventos de Stripe se deduplican por event.id.
 */
function createOrderStore(options = {}) {
  const dir = options.dir || path.join(__dirname, '..', '..', '..', 'data', 'payments');
  const filePath = path.join(dir, 'orders.json');
  const now = options.now || Date.now;

  function load() {
    const parsed = readJsonSafe(filePath, null);
    if (!parsed) return emptyState();
    if (parsed.version !== 1 || typeof parsed.orders !== 'object' || typeof parsed.entitlements !== 'object' ||
        typeof parsed.events !== 'object') throw new Error('Invalid payments store');
    return parsed;
  }

  function transact(mutator) {
    fs.mkdirSync(dir, { recursive: true });
    return withLock(dir, () => {
      const state = load();
      const result = mutator(state);
      pruneEvents(state);
      writeJsonAtomic(filePath, state);
      return result;
    });
  }

  function pruneEvents(state) {
    const cutoff = now() - EVENT_RETENTION_MS;
    const entries = Object.entries(state.events).filter(([, ts]) => ts >= cutoff).sort((a, b) => b[1] - a[1]);
    state.events = Object.fromEntries(entries.slice(0, MAX_EVENTS));
  }

  function snapshot() { return load(); }

  function hasEntitlement(guildId, userId, productId) {
    const ent = snapshot().entitlements[keyOf(guildId, userId, productId)];
    return Boolean(ent && !ent.revokedAt);
  }

  function getOrder(orderId) { return snapshot().orders[orderId] || null; }

  function getOrderBySession(sessionId) {
    return Object.values(snapshot().orders).find(o => o.sessionId === sessionId) || null;
  }

  function listOrdersForUser(guildId, userId, limit = 10) {
    return Object.values(snapshot().orders)
      .filter(o => o.guildId === guildId && o.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  function listPendingOrders(sinceMs = 24 * 60 * 60 * 1000) {
    const cutoff = now() - sinceMs;
    return Object.values(snapshot().orders).filter(o => o.status === 'pending' && o.sessionId && o.createdAt >= cutoff);
  }

  function ensurePendingOrder({ guildId, userId, product }) {
    assertIdentity(guildId, userId, product?.id);
    return transact(state => {
      const key = keyOf(guildId, userId, product.id);
      const ent = state.entitlements[key];
      if (ent && !ent.revokedAt) return { status: 'owned' };
      const t = now();
      for (const order of Object.values(state.orders)) {
        if (order.status === 'pending' && order.expiresAt <= t) order.status = 'expired';
      }
      const existing = Object.values(state.orders).find(o =>
        o.status === 'pending' && o.guildId === guildId && o.userId === userId && o.productId === product.id);
      if (existing) return { status: 'pending', order: existing };
      const order = {
        id: crypto.randomUUID(), guildId, userId, productId: product.id, key,
        amountCents: product.amountCents, currency: product.currency,
        status: 'pending', sessionId: null, paymentIntentId: null, createdAt: t, expiresAt: t + ORDER_TTL_MS
      };
      state.orders[order.id] = order;
      return { status: 'created', order };
    });
  }

  function attachSession(orderId, sessionId) {
    return transact(state => {
      const order = state.orders[orderId];
      if (!order || order.status !== 'pending') return false;
      if (order.sessionId && order.sessionId !== sessionId) return false;
      order.sessionId = sessionId;
      return true;
    });
  }

  function recordEvent(state, eventId) {
    if (state.events[eventId]) return false;
    state.events[eventId] = now();
    return true;
  }

  function grant(state, order, source) {
    state.entitlements[order.key] = {
      orderId: order.id, grantedAt: now(), source, revokedAt: null
    };
  }

  /** Aplica un pago confirmado. Devuelve granted | duplicate | unknown_order | mismatch | not_pending. */
  function applyPayment({ eventId, orderId, sessionId, amountTotal, currency, paymentIntentId }) {
    return transact(state => {
      if (!recordEvent(state, eventId)) return { status: 'duplicate' };
      const order = state.orders[orderId];
      if (!order) return { status: 'unknown_order' };
      if (order.sessionId !== sessionId || order.amountCents !== amountTotal ||
          order.currency !== String(currency || '').toLowerCase()) {
        order.status = 'flagged';
        order.flagReason = 'payment_mismatch';
        return { status: 'mismatch', order };
      }
      if (order.status === 'paid') return { status: 'duplicate', order };
      // Un pago legítimo que llega con la orden expirada localmente igual se acredita.
      if (!['pending', 'expired'].includes(order.status)) return { status: 'not_pending', order };
      order.status = 'paid';
      order.paidAt = now();
      order.paymentIntentId = paymentIntentId || null;
      grant(state, order, 'stripe');
      return { status: 'granted', order };
    });
  }

  function applyReversal({ eventId, paymentIntentId, newStatus }) {
    return transact(state => {
      if (!recordEvent(state, eventId)) return { status: 'duplicate' };
      const order = Object.values(state.orders).find(o => paymentIntentId && o.paymentIntentId === paymentIntentId);
      if (!order) return { status: 'unknown_order' };
      order.status = newStatus;
      order.reversedAt = now();
      const ent = state.entitlements[order.key];
      if (ent && ent.orderId === order.id && !ent.revokedAt) {
        ent.revokedAt = now();
        return { status: 'revoked', order };
      }
      return { status: 'no_entitlement', order };
    });
  }

  function applyExpiry({ eventId, sessionId }) {
    return transact(state => {
      if (!recordEvent(state, eventId)) return { status: 'duplicate' };
      const order = Object.values(state.orders).find(o => o.sessionId === sessionId);
      if (!order) return { status: 'unknown_order' };
      if (order.status === 'pending') order.status = 'expired';
      return { status: 'expired', order };
    });
  }

  function grantManual({ guildId, userId, productId, staffId }) {
    assertIdentity(guildId, userId, productId);
    return transact(state => {
      const key = keyOf(guildId, userId, productId);
      const ent = state.entitlements[key];
      if (ent && !ent.revokedAt) return { status: 'already_owned' };
      state.entitlements[key] = { orderId: null, grantedAt: now(), source: `staff:${staffId}`, revokedAt: null };
      return { status: 'granted' };
    });
  }

  function revokeManual({ guildId, userId, productId }) {
    assertIdentity(guildId, userId, productId);
    return transact(state => {
      const ent = state.entitlements[keyOf(guildId, userId, productId)];
      if (!ent || ent.revokedAt) return { status: 'not_owned' };
      ent.revokedAt = now();
      return { status: 'revoked' };
    });
  }

  return {
    filePath, hasEntitlement, getOrder, getOrderBySession, listOrdersForUser, listPendingOrders, ensurePendingOrder,
    attachSession, applyPayment, applyReversal, applyExpiry, grantManual, revokeManual
  };
}

module.exports = { createOrderStore, ORDER_TTL_MS };
