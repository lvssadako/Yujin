const fs = require('node:fs');
const path = require('node:path');

const ASSETS = {
  '/pay/static/pay.js': { file: 'pay.js', type: 'text/javascript; charset=utf-8' },
  '/pay/static/pay.css': { file: 'pay.css', type: 'text/css; charset=utf-8' }
};
const cache = new Map();

function readAsset(route) {
  const asset = ASSETS[route];
  if (!asset) return null;
  if (!cache.has(route)) cache.set(route, { body: fs.readFileSync(path.join(__dirname, 'web', asset.file)), type: asset.type });
  return cache.get(route);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "script-src 'self' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline'",
    "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com",
    "img-src 'self' data: https://*.stripe.com",
    "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'"
  ].join('; '),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store'
};

function layout({ brand, title, body, scripts = '' }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · ${esc(brand)}</title><link rel="stylesheet" href="/pay/static/pay.css"></head>
<body><main class="card"><header><span class="brand">${esc(brand)}</span></header>${body}
<footer>Pago procesado por Stripe. ${esc(brand)} no almacena datos de tu tarjeta.</footer></main>${scripts}</body></html>`;
}

function renderCheckoutPage({ brand, product, priceLabel, token, publishableKey, refundPolicy }) {
  return layout({
    brand, title: 'Pago',
    body: `<h1>${esc(product.name)}</h1><p class="muted">${esc(product.description)}</p>
<p class="price">${esc(priceLabel)} <span class="muted">pago único</span></p>
<div id="checkout" data-token="${esc(token)}" data-key="${esc(publishableKey)}"></div>
<p id="error" class="error" hidden>No se pudo cargar el pago. Vuelve a usar el comando en Discord para generar un enlace nuevo.</p>
<p class="muted small">${esc(refundPolicy)}</p>`,
    scripts: '<script src="https://js.stripe.com/v3/"></script><script src="/pay/static/pay.js"></script>'
  });
}

function renderStatusPage({ brand, title, message }) {
  return layout({ brand, title, body: `<h1>${esc(title)}</h1><p>${esc(message)}</p>` });
}

module.exports = { SECURITY_HEADERS, readAsset, renderCheckoutPage, renderStatusPage, esc };
