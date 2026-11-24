const { createEmbed, COLORS } = require('../../utils/ui');
const { PROFILE_BG_PRODUCT_ID, getProduct } = require('../../constants/paymentCatalog');
const { getProfileBackgroundService } = require('../profile/profileBackgroundService');
const { REQUIRED_STREAK_DAYS } = require('../profile/backgroundAccess');
const { buildPurchaseOfferEmbed } = require('./paymentMessages');
const payments = require('./paymentsService');

const REASONS = {
  booster: 'Eres **Booster**: cambias tu fondo cuando quieras, gratis.',
  streak: `Tienes una **racha de ${REQUIRED_STREAK_DAYS}+ días**: cambias tu fondo cuando quieras, gratis.`,
  pass: 'Tienes el **Pase de Fondo**: cambias tu fondo cuando quieras.'
};

/** Resultado común para /fondo y &fondo: { kind, embed?|content? }. El enlace es personal: nunca va a un canal público. */
function resolvePurchase(member) {
  const access = getProfileBackgroundService().getAccess(member);
  if (access.allowed) return { kind: 'no_need', content: `✅ ${REASONS[access.reason]} Usa \`/profileset\` para elegirlo.` };

  const result = payments.createPurchaseLink({ guildId: member.guild.id, userId: member.id || member.user.id });
  if (result.status === 'disabled') {
    return { kind: 'disabled', content: '⚠️ Las compras no están disponibles ahora mismo. Avisa al staff del servidor e inténtalo más tarde.' };
  }
  if (result.status !== 'ok') return { kind: 'error', content: '❌ No se pudo generar el enlace de pago. Inténtalo de nuevo en unos minutos.' };
  return { kind: 'offer', embed: buildPurchaseOfferEmbed(result.product, result.url) };
}

function resolveStatus(member) {
  const access = getProfileBackgroundService().getAccess(member);
  const product = getProduct(PROFILE_BG_PRODUCT_ID);
  const embed = createEmbed(access.allowed ? COLORS.success : COLORS.warning)
    .setAuthor({ name: '🖼️ Estado de tu Fondo Personalizado' })
    .setDescription(access.allowed
      ? REASONS[access.reason]
      : `Aún no tienes acceso a fondos con tu propia imagen.\nPuedes ser **Booster**, mantener una **racha de ${REQUIRED_STREAK_DAYS}+ días** o comprar el **${product.name}** con \`/fondo comprar\`.`);
  return { embed };
}

module.exports = { resolvePurchase, resolveStatus };
