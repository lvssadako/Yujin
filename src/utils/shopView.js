const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createEmbed, formatNumber, clip } = require('./ui');

function buildCatalogView(catalog, userData, discountFor, priceFor, requestedPage = 0, ownerId = '') {
  const pages = Math.max(1, Math.ceil(catalog.length / 8));
  const page = Math.max(0, Math.min(pages - 1, Number(requestedPage) || 0));
  const items = catalog.slice(page * 8, page * 8 + 8);
  const discountActive = Number(userData.streakDays || 0) >= 3;
  const embed = createEmbed().setAuthor({ name: 'Yujin ♥ · Tienda' }).setTitle('🛍️ Un impulso para tu próxima meta')
    .setDescription('Elige un producto para comprarlo. Los boosts se activan o se guardan en tu cola.\n' + (discountActive ? '**Descuento por racha activo: 10 %.**' : 'Consigue una racha de actividad de 3 días para activar el descuento del 10 %.'))
    .setFooter({ text: 'Precios para quien abrió la tienda · Página ' + (page + 1) + ' de ' + pages + ' · ' + catalog.length + ' productos' });
  for (const item of items) {
    const discount = discountFor(item, userData);
    const price = priceFor(item, userData);
    const benefit = item.kind === 'bundle' ? (item.included?.length || 0) + ' boosts incluidos' : item.multiplier + '× XP · ' + (item.durationMs / 3600000).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' h';
    embed.addFields({ name: clip((item.featured ? '★ ' : '') + item.name, 100), value: clip(item.description || 'Boost de experiencia.', 180) + '\n**' + formatNumber(price) + ' monedas**' + (discount ? ' · ' + discount + '% de descuento' : '') + '\n' + benefit + '\nID: `' + clip(item.id, 80) + '`', inline: false });
  }
  if (!items.length) embed.setDescription('Todavía no hay productos disponibles. Vuelve más tarde.');
  const components = [];
  for (let index = 0; index < items.length; index += 4) {
    components.push(new ActionRowBuilder().addComponents(items.slice(index, index + 4).map(item => new ButtonBuilder().setCustomId('shop_buy_' + item.id).setLabel(clip(item.name, 35)).setStyle(ButtonStyle.Primary))));
  }
  if (pages > 1) components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_page_' + ownerId + '_' + (page - 1)).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId('shop_page_' + ownerId + '_' + (page + 1)).setLabel('Siguiente').setStyle(ButtonStyle.Secondary).setDisabled(page === pages - 1)));
  return { embed, components, page, pages, items };
}
module.exports = { buildCatalogView };
