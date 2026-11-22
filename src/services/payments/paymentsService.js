const logger = require('../../utils/logger');
const { PROFILE_BG_PRODUCT_ID, getProduct } = require('../../constants/paymentCatalog');
const { createOrderStore } = require('./orderStore');
const { createStripeGateway } = require('./stripeGateway');
const { createFulfillment } = require('./paymentFulfillment');
const { createPaymentHandler } = require('./paymentHttp');
const { startReconciler } = require('./reconciler');

let store = null;
let runtime = null;

function getStore() {
  if (!store) store = createOrderStore();
  return store;
}

// Lee solo process.env (nunca .env directamente). Sin todas las claves, los pagos quedan apagados.
function readConfig(env = process.env) {
  const baseUrl = String(env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const secureBase = /^https:\/\//.test(baseUrl) || /^http:\/\/localhost(:\d+)?$/.test(baseUrl);
  const config = {
    secretKey: env.STRIPE_SECRET_KEY || '', publishableKey: env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '', tokenSecret: env.PAYMENT_LINK_SECRET || '',
    baseUrl, brand: env.PAYMENT_BRAND_NAME || 'Yujin', refundPolicy: env.PAYMENT_REFUND_POLICY || undefined
  };
  config.enabled = Boolean(config.secretKey && /^pk_(test|live)_/.test(config.publishableKey) && config.webhookSecret &&
    config.tokenSecret.length >= 32 && secureBase);
  return config;
}

function init(client, options = {}) {
  if (runtime) return runtime;
  const config = options.config || readConfig();
  if (!config.enabled) {
    logger.info('[Pagos] Desactivados: faltan variables de Stripe o PUBLIC_BASE_URL no es HTTPS.');
    return null;
  }
  const orderStore = getStore();
  const gateway = options.gateway || createStripeGateway(config);
  const { getProfileBackgroundService } = require('../profile/profileBackgroundService');
  const { buildPurchaseGrantedEmbed } = require('./paymentMessages');

  const fulfillment = createFulfillment({
    store: orderStore, logger,
    onGranted: async order => {
      const user = await client.users.fetch(order.userId).catch(() => null);
      if (user) await user.send({ embeds: [buildPurchaseGrantedEmbed(getProduct(order.productId))] }).catch(() => {});
    },
    onRevoked: async order => {
      const guild = client.guilds.cache.get(order.guildId);
      if (guild) await getProfileBackgroundService().enforceAccess(guild, order.userId);
    }
  });
  const handler = createPaymentHandler({ ...config, store: orderStore, gateway, fulfillment, tokenSecret: config.tokenSecret, logger });
  const stopReconciler = options.reconcile === false ? () => {} : startReconciler({ store: orderStore, gateway, fulfillment, logger });
  runtime = { config, handler, fulfillment, gateway, stop() { stopReconciler(); handler.limiter.stop(); runtime = null; } };
  return runtime;
}

function handleHttp(req, res) {
  return runtime ? runtime.handler.handle(req, res) : false;
}

function isEnabled() { return Boolean(runtime); }

/** Crea (o reutiliza) la orden pendiente y devuelve el enlace de pago firmado. */
function createPurchaseLink({ guildId, userId, productId = PROFILE_BG_PRODUCT_ID }) {
  if (!runtime) return { status: 'disabled' };
  const product = getProduct(productId);
  if (!product) return { status: 'unknown_product' };
  const result = getStore().ensurePendingOrder({ guildId, userId, product });
  if (result.status === 'owned') return { status: 'owned' };
  return { status: 'ok', url: runtime.handler.createLink(result.order), order: result.order, product };
}

module.exports = { init, getStore, readConfig, handleHttp, isEnabled, createPurchaseLink };
