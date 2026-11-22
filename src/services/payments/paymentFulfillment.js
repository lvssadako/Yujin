const { getProduct } = require('../../constants/paymentCatalog');

const noop = async () => {};

/**
 * Convierte eventos de Stripe en cambios del libro de órdenes.
 * onGranted/onRevoked son efectos laterales (DM, limpiar fondo) y nunca rompen la idempotencia.
 */
function createFulfillment({ store, logger = { warn() {}, error() {}, info() {} }, onGranted = noop, onRevoked = noop }) {
  async function safely(fn, order, label) {
    try { await fn(order); }
    catch (error) { logger.error(`[Pagos] Fallo en ${label}`, { orderId: order?.id, error: error.message }); }
  }

  async function handleEvent(event) {
    const object = event?.data?.object;
    if (!event?.id || !object) return { status: 'ignored' };

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        // Con pagos diferidos (OXXO/SPEI) "completed" llega sin pagar: se espera el evento posterior.
        if (object.payment_status !== 'paid') return { status: 'awaiting_payment' };
        const orderId = object.client_reference_id;
        if (!orderId || object.metadata?.orderId !== orderId) {
          logger.warn('[Pagos] Sesión pagada sin referencia coherente', { sessionId: object.id });
          return { status: 'unknown_order' };
        }
        const result = store.applyPayment({
          eventId: event.id, orderId, sessionId: object.id, amountTotal: object.amount_total,
          currency: object.currency, paymentIntentId: typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id
        });
        if (result.status === 'mismatch') logger.error('[Pagos] Pago con monto/moneda/sesión distintos; requiere revisión', { orderId });
        if (result.status === 'granted' && getProduct(result.order.productId)) await safely(onGranted, result.order, 'onGranted');
        return result;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        return store.applyExpiry({ eventId: event.id, sessionId: object.id });
      case 'charge.refunded': {
        if (object.refunded !== true) return { status: 'partial_refund_ignored' };
        const result = store.applyReversal({ eventId: event.id, paymentIntentId: object.payment_intent, newStatus: 'refunded' });
        if (result.status === 'revoked') await safely(onRevoked, result.order, 'onRevoked');
        return result;
      }
      case 'charge.dispute.created': {
        const result = store.applyReversal({ eventId: event.id, paymentIntentId: object.payment_intent, newStatus: 'disputed' });
        if (result.status === 'revoked') await safely(onRevoked, result.order, 'onRevoked');
        return result;
      }
      default:
        return { status: 'ignored' };
    }
  }

  return { handleEvent };
}

module.exports = { createFulfillment };
