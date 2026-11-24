const HOUR_MS = 60 * 60 * 1000;

/**
 * Consulta a Stripe las órdenes pendientes recientes por si se perdió un webhook
 * (bot caído, reinicio). Usa ids sintéticos de evento: son idempotentes frente al webhook real.
 */
async function reconcileOrders({ store, gateway, fulfillment, logger = { warn() {}, info() {} } }) {
  const summary = { checked: 0, granted: 0, expired: 0, errors: 0 };
  for (const order of store.listPendingOrders()) {
    summary.checked += 1;
    try {
      const session = await gateway.retrieveSession(order.sessionId);
      if (session.status === 'complete' && session.payment_status === 'paid') {
        const result = await fulfillment.handleEvent({
          id: `reconcile_paid_${session.id}`, type: 'checkout.session.completed', data: { object: session }
        });
        if (result.status === 'granted') summary.granted += 1;
      } else if (session.status === 'expired') {
        await fulfillment.handleEvent({
          id: `reconcile_expired_${session.id}`, type: 'checkout.session.expired', data: { object: session }
        });
        summary.expired += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.warn('[Pagos] Reconciliación fallida para una orden', { orderId: order.id, error: error.message });
    }
  }
  return summary;
}

function startReconciler(deps, intervalMs = HOUR_MS) {
  const run = () => reconcileOrders(deps).catch(error => deps.logger?.warn?.('[Pagos] Reconciliador', { error: error.message }));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { reconcileOrders, startReconciler };
