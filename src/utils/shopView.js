const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, formatNumber, clip, COLORS } = require('./ui');
const { STREAK_ACTIVATION_DAYS } = require('../constants/streakRules');
const { CATEGORIES, filterByCategory } = require('../services/shop/shopCatalog');

const PAGE_SIZE = 8;
const RARITY_COLOR = { common: 0x5ac8fa, rare: 0x7b61ff, epic: 0xffd166, legendary: 0xff7a59 };
const RARITY_LABEL = { common: '⚪ Común', rare: '🔵 Rara', epic: '🟣 Épica', legendary: '🟠 Legendaria' };

// Quita solo emojis/símbolos iniciales ("🛡️ Escudo" → "Escudo"); "Boost 1h" se conserva completo.
function buttonLabel(name) {
  const text = String(name || '');
  return text.replace(/^[^\p{L}\p{N}]+/u, '').trim() || text;
}

function benefitText(item) {
  switch (item.kind) {
    case 'bundle': return '📦 ' + (item.included?.length || 0) + ' boosts incluidos';
    case 'item': return '🎒 Objeto de inventario';
    case 'role': return '🎭 ' + (item.days > 0 ? item.days + ' días' : 'Permanente') + ' · <@&' + item.roleId + '>';
    case 'reroll': return '🔄 Uso inmediato';
    default: return '⚡ ' + item.multiplier + '× XP · ' + (item.durationMs / 3600000).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' h';
  }
}

function buildCatalogView(catalog, userData, discountFor, priceFor, requestedPage = 0, ownerId = '', category = 'all', options = {}) {
  const cat = CATEGORIES[category] ? category : 'all';
  const list = filterByCategory(catalog, cat);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Number(requestedPage) || 0));
  const items = list.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const discountActive = Number(userData.streakDays || 0) >= STREAK_ACTIVATION_DAYS;

  const embed = createEmbed(COLORS.economy).setAuthor({ name: 'Yujin ♥ · Tienda' })
    .setTitle(CATEGORIES[cat].emoji + ' ' + (cat === 'all' ? 'Un impulso para tu próxima meta' : CATEGORIES[cat].label))
    .setDescription('Gasta tus monedas 🪙 en boosts, objetos, roles y utilidades. Elige una categoría y pulsa el producto que quieras.\n' +
      (discountActive ? '🔥 **Descuento por racha activo: 10 %.**' : 'Consigue una racha de actividad de ' + STREAK_ACTIVATION_DAYS + ' días para activar el descuento del 10 %.') +
      (options.boosterDiscount > 0 ? '\n💎 **Beneficio de Booster: -' + options.boosterDiscount + ' % extra** (los descuentos se suman hasta un máximo de 45 %).' : ''))
    .setFooter({ text: 'Precios para quien abrió la tienda · Página ' + (page + 1) + ' de ' + pages + ' · ' + list.length + ' productos' });

  for (const item of items) {
    const discount = discountFor(item, userData);
    const price = priceFor(item, userData);
    embed.addFields({
      name: clip((item.featured ? '★ ' : '') + item.name + '  ·  ' + (RARITY_LABEL[item.rarity] || RARITY_LABEL.common), 100),
      value: clip(item.description || 'Producto de la tienda.', 180) + '\n💰 **' + formatNumber(price) + ' 🪙**' + (discount ? ' · ~~' + formatNumber(item.price) + '~~ -' + discount + '%' : '') +
        '\n' + benefitText(item) + '\n`ID: ' + clip(item.id, 60) + '`',
      inline: false
    });
  }
  if (!items.length) embed.setDescription(cat === 'all' ? 'Todavía no hay productos disponibles. Vuelve más tarde.' : 'Esta categoría aún no tiene productos. Prueba con otra.');

  const components = [];
  for (let index = 0; index < items.length; index += 4) {
    components.push(new ActionRowBuilder().addComponents(items.slice(index, index + 4).map(item =>
      new ButtonBuilder().setCustomId(('shop_buy_' + item.id).slice(0, 100)).setLabel(clip(buttonLabel(item.name), 35)).setStyle(ButtonStyle.Primary))));
  }
  const nav = [];
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    const count = filterByCategory(catalog, key).length;
    nav.push(new ButtonBuilder().setCustomId('shop_cat_' + ownerId + '_' + key).setLabel(meta.label).setEmoji(meta.emoji)
      .setStyle(key === cat ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(key !== 'all' && count === 0));
  }
  components.push(new ActionRowBuilder().addComponents(nav));
  if (pages > 1) components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_page_' + ownerId + '_' + cat + '_' + (page - 1)).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('shop_page_' + ownerId + '_' + cat + '_' + (page + 1)).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1)));
  return { embed, components, page, pages, items, category: cat };
}

function buildPurchaseEmbed(result) {
  return createEmbed(RARITY_COLOR[result.rarity] || COLORS.success).setTitle(result.title).setDescription(result.summary)
    .addFields(...result.fields).setTimestamp();
}

module.exports = { buildCatalogView, buildPurchaseEmbed, benefitText, buttonLabel, PAGE_SIZE };
