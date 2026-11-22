const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../../utils/configCache');
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { buildCatalog, getDiscountForUser, getFinalPrice, findItem, CATEGORIES } = require('../../services/shop/shopCatalog');
const { getPurchaseService } = require('../../services/shop/purchaseService');
const { buildCatalogView, buildPurchaseEmbed } = require('../../utils/shopView');

const timezoneOf = cfg => cfg.timezone || 0;

function view(cfg, userData, page, ownerId, category) {
  const catalog = buildCatalog(cfg);
  return { catalog, ...buildCatalogView(catalog, userData, getDiscountForUser, getFinalPrice, page, ownerId, category) };
}

async function runPurchase({ guild, userId, member, itemId }) {
  const cfg = readConfig();
  const userData = ensureUser(readProfiles(), guild.id, userId);
  const catalog = buildCatalog(cfg);
  const result = await getPurchaseService().purchase({ guild, member, userId, item: findItem(catalog, itemId), catalog, cfg, userData, tz: timezoneOf(cfg) });
  return result.ok ? { embed: buildPurchaseEmbed(result) } : { error: result.error };
}

module.exports = {
  name: 'shop',
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Tienda: boosts, objetos, roles y utilidades para tus monedas.')
    .addStringOption(o => o.setName('id').setDescription('ID del producto a comprar directamente').setRequired(false)),

  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Abre este comando en un servidor.', ephemeral: true });
    const buyId = interaction.options.getString('id');
    if (buyId) {
      const result = await runPurchase({ guild: interaction.guild, userId: interaction.user.id, member: interaction.member, itemId: buyId });
      return result.error ? interaction.reply({ content: result.error, ephemeral: true }) : interaction.reply({ embeds: [result.embed], ephemeral: true });
    }
    const userData = ensureUser(readProfiles(), interaction.guildId, interaction.user.id);
    const { embed, components } = view(readConfig(), userData, 0, interaction.user.id, 'all');
    return interaction.reply({ embeds: [embed], components });
  },

  async handleButton(interaction) {
    const id = interaction.customId;
    const own = id.match(/^shop_(?:cat|page)_(\d{17,20})_/)?.[1];
    if (own && own !== interaction.user.id) return interaction.reply({ content: 'Abre /shop o &shop para explorar tu propia tienda.', flags: 64 });

    const userData = ensureUser(readProfiles(), interaction.guildId, interaction.user.id);
    if (id.startsWith('shop_cat_')) {
      const category = id.split('_').pop();
      const v = view(readConfig(), userData, 0, interaction.user.id, CATEGORIES[category] ? category : 'all');
      return interaction.update({ embeds: [v.embed], components: v.components });
    }
    if (id.startsWith('shop_page_')) {
      // shop_page_<owner>_<categoria>_<página>   (formato anterior: shop_page_<owner>_<página>)
      const match = /^shop_page_(\d{17,20})_(?:([a-z]+)_)?(-?\d+)$/.exec(id);
      if (!match) return interaction.reply({ content: 'Abre /shop o &shop para explorar tu propia tienda.', flags: 64 });
      const v = view(readConfig(), userData, Number(match[3]), interaction.user.id, match[2] || 'all');
      return interaction.update({ embeds: [v.embed], components: v.components });
    }
    const result = await runPurchase({ guild: interaction.guild, userId: interaction.user.id, member: interaction.member, itemId: id.replace('shop_buy_', '') });
    return result.error ? interaction.reply({ content: result.error, ephemeral: true }) : interaction.reply({ embeds: [result.embed], ephemeral: true });
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('Abre este comando en un servidor.');
    if (args[0]) {
      const result = await runPurchase({ guild: message.guild, userId: message.author.id, member: message.member, itemId: args[0] });
      return result.error ? message.reply(result.error) : message.reply({ embeds: [result.embed] });
    }
    const userData = ensureUser(readProfiles(), message.guild.id, message.author.id);
    const { embed, components } = view(readConfig(), userData, 0, message.author.id, 'all');
    return message.reply({ embeds: [embed], components });
  },

  runPurchase
};
