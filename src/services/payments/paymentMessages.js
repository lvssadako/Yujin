const { createEmbed, COLORS } = require('../../utils/ui');
const { formatPrice } = require('../../constants/paymentCatalog');

function buildPurchaseGrantedEmbed(product) {
  return createEmbed()
    .setColor(COLORS.success)
    .setAuthor({ name: '✅ ¡Compra confirmada!' })
    .setDescription(`Tu **${product.name}** ya está activo. Cambia tu fondo cuando quieras con \`/profileset\` o \`&profileset fondo <url>\`.`)
    .setFooter({ text: 'Si algo no se ve bien, contacta al staff del servidor.' })
    .setTimestamp();
}

function buildPurchaseOfferEmbed(product, url) {
  return createEmbed()
    .setColor(COLORS.info || COLORS.success)
    .setAuthor({ name: `🖼️ ${product.name}` })
    .setDescription(`${product.description}\n\n**Precio:** ${formatPrice(product)} (pago único)\n[Pagar de forma segura](${url})\n\nEl enlace es personal y vence en 30 minutos. Los **Boosters** y quien tenga una racha de **360+ días** no necesitan pagar.`)
    .setFooter({ text: 'Pago procesado por Stripe. No compartas este enlace.' });
}

module.exports = { buildPurchaseGrantedEmbed, buildPurchaseOfferEmbed };
