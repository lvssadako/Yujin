const SESSION_LIFETIME_SECONDS = 31 * 60; // Stripe exige entre 30 min y 24 h.

// Envoltorio fino sobre el SDK para poder inyectar un doble en pruebas.
function createStripeGateway(options = {}) {
  const { secretKey, webhookSecret, baseUrl } = options;
  let stripe = options.stripe;
  if (!stripe) {
    if (typeof secretKey !== 'string' || !/^(sk|rk)_(test|live)_/.test(secretKey)) throw new Error('STRIPE_SECRET_KEY inválida');
    const Stripe = require('stripe');
    stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 15000 });
  }

  return {
    async createCheckoutSession(order, product) {
      return stripe.checkout.sessions.create({
        ui_mode: 'embedded_page',
        mode: 'payment',
        client_reference_id: order.id,
        metadata: { orderId: order.id, guildId: order.guildId, userId: order.userId, productId: product.id },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: product.currency,
            unit_amount: product.amountCents,
            product_data: { name: product.name, description: product.description }
          }
        }],
        return_url: `${baseUrl}/pay/return?session_id={CHECKOUT_SESSION_ID}`,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS
      }, { idempotencyKey: `order-${order.id}` });
    },
    retrieveSession(sessionId) {
      return stripe.checkout.sessions.retrieve(sessionId);
    },
    constructEvent(rawBody, signatureHeader) {
      if (typeof webhookSecret !== 'string' || !webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET no configurado');
      return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
    }
  };
}

module.exports = { createStripeGateway };
