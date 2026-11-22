const { z } = require('zod');

const productSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{3,40}$/),
  name: z.string().min(3).max(60),
  description: z.string().min(3).max(200),
  amountCents: z.number().int().min(50).max(100000),
  currency: z.string().regex(/^[a-z]{3}$/)
}).strict();

// El catálogo vive en el servidor: nunca se confía en montos que lleguen del cliente o de metadata.
const PRODUCTS = Object.freeze({
  profile_bg_pass: Object.freeze(productSchema.parse({
    id: 'profile_bg_pass',
    name: 'Pase de Fondo Personalizado',
    description: 'Cambia el fondo de tu perfil con tu propia imagen, sin límite de cambios.',
    amountCents: 499,
    currency: 'usd'
  }))
});

function getProduct(productId) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, productId) ? PRODUCTS[productId] : null;
}

function formatPrice(product) {
  return `${(product.amountCents / 100).toFixed(2)} ${product.currency.toUpperCase()}`;
}

module.exports = { PRODUCTS, PROFILE_BG_PRODUCT_ID: 'profile_bg_pass', getProduct, formatPrice };
