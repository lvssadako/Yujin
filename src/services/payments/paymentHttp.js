const { getProduct, formatPrice } = require('../../constants/paymentCatalog');
const { verifyPaymentToken, createPaymentToken } = require('./paymentToken');
const { createRateLimiter } = require('./rateLimiter');
const { SECURITY_HEADERS, readAsset, renderCheckoutPage, renderStatusPage } = require('./payPage');

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]{10,200}$/;

/**
 * Manejador HTTP de pagos: devuelve true si atendió la petición (el servidor ya existente
 * lo llama primero), false si la ruta no le pertenece.
 */
function createPaymentHandler(options) {
  const { store, gateway, fulfillment, tokenSecret, baseUrl, publishableKey, logger = { error() {}, warn() {} } } = options;
  const brand = options.brand || 'Yujin';
  const refundPolicy = options.refundPolicy || 'Compra digital de pago único. Para soporte o reembolsos contacta al staff del servidor.';
  const limiter = options.limiter || createRateLimiter({ limit: 30, windowMs: 60 * 1000 });
  const allowedOrigin = (() => { try { return new URL(baseUrl).origin; } catch { return null; } })();

  const send = (res, status, body, headers = {}) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  };
  const html = (res, status, body) => send(res, status, body, { 'Content-Type': 'text/html; charset=utf-8' });
  const json = (res, status, payload) => send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json' });
  const status = (res, code, title, message) => html(res, code, renderStatusPage({ brand, title, message }));
  const clientKey = req => req.socket?.remoteAddress || 'unknown';

  function readBody(req, res, max, onBody) {
    const chunks = [];
    let bytes = 0; let exceeded = false;
    req.on('data', chunk => {
      if (exceeded) return;
      bytes += chunk.length;
      if (bytes > max) { exceeded = true; chunks.length = 0; return json(res, 413, { error: 'Payload too large' }); }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!exceeded) onBody(Buffer.concat(chunks)); });
    req.on('error', () => {});
  }

  function handleWebhook(req, res) {
    readBody(req, res, MAX_WEBHOOK_BYTES, async body => {
      let event;
      try { event = gateway.constructEvent(body, req.headers['stripe-signature']); }
      catch { return json(res, 400, { error: 'Invalid signature' }); }
      try {
        const result = await fulfillment.handleEvent(event);
        return json(res, 200, { received: true, status: result.status });
      } catch (error) {
        logger.error('[Pagos] Error procesando webhook', { eventId: event.id, error: error.message });
        return json(res, 500, { error: 'Processing failed' }); // Stripe reintenta; el almacén es idempotente.
      }
    });
  }

  function resolveToken(token) {
    const verified = verifyPaymentToken(tokenSecret, token);
    if (!verified.ok) return null;
    const order = store.getOrder(verified.orderId);
    return order && order.status === 'pending' ? order : null;
  }

  async function handleCheckoutPage(req, res, token) {
    const order = resolveToken(token);
    if (!order) return status(res, 403, 'Enlace no válido', 'Este enlace de pago expiró, ya se usó o no es válido. Genera uno nuevo desde Discord con el comando de compra.');
    const product = getProduct(order.productId);
    if (!product) return status(res, 404, 'Producto no disponible', 'Este producto ya no está disponible.');
    return html(res, 200, renderCheckoutPage({ brand, product, priceLabel: formatPrice(product), token, publishableKey, refundPolicy }));
  }

  async function handleSession(req, res, token) {
    if (req.headers.origin && req.headers.origin !== allowedOrigin) return json(res, 403, { error: 'Forbidden' });
    const order = resolveToken(token);
    if (!order) return json(res, 403, { error: 'Invalid or expired link' });
    const product = getProduct(order.productId);
    if (!product) return json(res, 404, { error: 'Unavailable' });
    try {
      let session;
      if (order.sessionId) {
        session = await gateway.retrieveSession(order.sessionId);
        if (session.status !== 'open') return json(res, 409, { error: 'Session closed' });
      } else {
        session = await gateway.createCheckoutSession(order, product);
        if (!store.attachSession(order.id, session.id)) return json(res, 409, { error: 'Order changed' });
      }
      return json(res, 200, { clientSecret: session.client_secret });
    } catch (error) {
      logger.error('[Pagos] No se pudo crear la sesión de pago', { orderId: order.id, error: error.message });
      return json(res, 502, { error: 'Payment provider unavailable' });
    }
  }

  async function handleReturn(req, res, url) {
    const sessionId = url.searchParams.get('session_id') || '';
    if (!SESSION_ID_RE.test(sessionId)) return status(res, 400, 'Solicitud inválida', 'No pudimos identificar tu pago.');
    try {
      const session = await gateway.retrieveSession(sessionId);
      // Solo informativo: la entrega ocurre únicamente por el webhook firmado.
      if (session.status === 'complete' && session.payment_status === 'paid') {
        return status(res, 200, '¡Pago recibido!', 'Estamos activando tu compra; en unos instantes te avisaremos por Discord. Ya puedes cerrar esta página.');
      }
      if (session.status === 'complete') return status(res, 200, 'Pago en proceso', 'Tu pago está pendiente de confirmación. Te avisaremos por Discord cuando se acredite.');
      return status(res, 200, 'Pago no completado', 'No se realizó ningún cargo. Puedes volver a intentarlo desde Discord.');
    } catch {
      return status(res, 502, 'Estado no disponible', 'No pudimos consultar el estado ahora mismo. Si pagaste, recibirás un aviso por Discord.');
    }
  }

  function handle(req, res) {
    // La ruta se recalcula aquí sin pasar a minúsculas: los tokens distinguen mayúsculas.
    const route = ((req.url || '/').split('?')[0].replace(/\/+$/, '')) || '/';
    const isWebhook = route === '/webhook/stripe';
    if (!isWebhook && !route.startsWith('/pay/')) return false;
    req.on('error', () => {});

    if (isWebhook) {
      if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed' }); return true; }
      handleWebhook(req, res);
      return true;
    }
    if (!limiter.allow(clientKey(req))) { json(res, 429, { error: 'Too many requests' }); return true; }

    const asset = req.method === 'GET' ? readAsset(route) : null;
    if (asset) { send(res, 200, asset.body, { 'Content-Type': asset.type }); return true; }

    const url = new URL(req.url, 'http://localhost');
    const sessionMatch = /^\/pay\/session\/([^/]+)$/.exec(route);
    if (sessionMatch && req.method === 'POST') { req.resume(); handleSession(req, res, decodeURIComponent(sessionMatch[1])); return true; }
    if (route === '/pay/return' && req.method === 'GET') { handleReturn(req, res, url); return true; }
    const pageMatch = /^\/pay\/([^/]+)$/.exec(route);
    if (pageMatch && req.method === 'GET') { handleCheckoutPage(req, res, decodeURIComponent(pageMatch[1])); return true; }
    json(res, 404, { error: 'Not found' });
    return true;
  }

  return { handle, limiter, createLink: order => `${baseUrl}/pay/${createPaymentToken(tokenSecret, order.id, order.expiresAt)}` };
}

module.exports = { createPaymentHandler };
