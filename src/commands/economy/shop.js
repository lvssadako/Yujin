const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readConfig } = require('../../../utils/configCache');
const { readProfiles, writeProfiles, ensureUser } = require('../../../utils/profileStore');
const { getBalance, subtractCoins } = require('../../../utils/economy');

function asHours(ms) {
  return `${(ms / 3600000).toFixed(1)}h`;
}

function getRarityColor(rarity = 'common') {
  const map = {
    common: 0x5ac8fa,
    rare: 0x7b61ff,
    epic: 0xffd166,
    legendary: 0xff7a59
  };
  return map[String(rarity).toLowerCase()] || map.common;
}

function getDiscountForUser(item, userData) {
  const streakDiscount = Number(userData.streakDays || 0) >= 3 ? 10 : 0;
  const itemDiscount = Number(item.discountPercent) || 0;
  return Math.min(45, Math.max(0, itemDiscount + streakDiscount));
}

function getFinalPrice(item, userData) {
  const discount = getDiscountForUser(item, userData);
  return Math.max(0, Math.round(Number(item.price || 0) * (1 - discount / 100)));
}

function normalizeCatalog(cfg) {
  const boosts = { ...(cfg.xpBoosts || {}) };
  const catalog = [];

  Object.entries(boosts).forEach(([id, item]) => {
    catalog.push({
      id,
      category: 'boosts',
      kind: 'boost',
      name: item.name || id,
      price: Number(item.price) || 0,
      multiplier: Number(item.multiplier) || 1,
      durationMs: Number(item.durationMs) || 3600000,
      description: item.description || `Boost de XP con multiplicador ${item.multiplier}x`,
      rarity: item.rarity || 'common',
      discountPercent: Number(item.discountPercent) || 0,
      featured: false,
      isBundle: false
    });
  });

  const bundles = Array.isArray(cfg.shopBundles) ? cfg.shopBundles : [
    {
      id: 'pack_2x_3h',
      category: 'packs',
      kind: 'bundle',
      name: 'Pack XP 3h',
      price: 35000,
      description: 'Incluye tres boosts de 2x durante 1 hora cada uno.',
      included: ['boost1h', 'boost1h', 'boost1h'],
      featured: false,
      rarity: 'rare'
    },
    {
      id: 'vip_week',
      category: 'packs',
      kind: 'bundle',
      name: 'Pack semanal',
      price: 90000,
      description: '1 boost de 2x durante 24h y 2 boosts de 1.75x durante 3h.',
      included: ['boost24h', 'boost3h', 'boost3h'],
      featured: false,
      rarity: 'epic'
    }
  ];

  bundles.forEach(item => {
    catalog.push({
      ...item,
      category: item.category || 'packs',
      kind: item.kind || 'bundle',
      price: Number(item.price) || 0,
      description: item.description || 'Paquete especial',
      rarity: item.rarity || 'rare',
      discountPercent: Number(item.discountPercent) || 0,
      featured: Boolean(item.featured),
      included: Array.isArray(item.included) ? item.included : []
    });
  });

  const featured = Array.isArray(cfg.shopFeatured) ? cfg.shopFeatured : [
    {
      id: 'featured_2x_12h',
      category: 'featured',
      kind: 'boost',
      name: 'Oferta especial • 2x 12h',
      price: 18000,
      multiplier: 2,
      durationMs: 43200000,
      description: 'Oferta del día para subir XP rápido.',
      featured: true,
      rarity: 'epic'
    }
  ];

  featured.forEach(item => {
    catalog.push({
      ...item,
      category: item.category || 'featured',
      kind: item.kind || 'boost',
      price: Number(item.price) || 0,
      description: item.description || 'Oferta especial',
      rarity: item.rarity || 'epic',
      discountPercent: Number(item.discountPercent) || 0,
      featured: true,
      included: Array.isArray(item.included) ? item.included : []
    });
  });

  return catalog;
}

function findItemById(catalog, id) {
  return catalog.find(item => item.id === id) || null;
}

function grantBoostToUser(guildId, userId, boostDef, quantity = 1) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  if (!u.xpBoostsQueue) u.xpBoostsQueue = [];
  if (!u.xpBoostsActive) u.xpBoostsActive = [];

  const now = Date.now();
  u.xpBoostsActive = u.xpBoostsActive.filter(b => b.expiresAt > now);

  for (let i = 0; i < quantity; i++) {
    if (u.xpBoostsActive.length === 0) {
      const expiresAt = now + Number(boostDef.durationMs || 3600000);
      u.xpBoostsActive.push({
        id: boostDef.id,
        multiplier: Number(boostDef.multiplier) || 1,
        expiresAt
      });
    } else {
      u.xpBoostsQueue.push({
        id: boostDef.id,
        multiplier: Number(boostDef.multiplier) || 1,
        durationMs: Number(boostDef.durationMs) || 3600000
      });
    }
  }

  writeProfiles(profiles);
}

function buildShopEmbed(cfg, userData) {
  const catalog = normalizeCatalog(cfg);
  const sections = [
    { key: 'featured', title: '🔥 Oferta especial', emoji: '🔥' },
    { key: 'boosts', title: '⚡ Boosts XP', emoji: '⚡' },
    { key: 'packs', title: '📦 Packs', emoji: '📦' }
  ];

  const embed = new EmbedBuilder()
    .setTitle('🛒 Tienda premium del servidor')
    .setColor(0xF6C343)
    .setDescription('Compra boosts, packs y ofertas especiales. Mantén tu racha para obtener descuentos.')
    .setFooter({ text: userData?.streakDays ? `Racha activa: ${userData.streakDays} días • Descuento por streak: 10%` : 'Mantén tu racha para activar descuento' });

  sections.forEach(section => {
    const items = catalog.filter(item => item.category === section.key);
    if (!items.length) return;

    const lines = items.map(item => {
      const discount = getDiscountForUser(item, userData);
      const finalPrice = getFinalPrice(item, userData);
      const suffix = item.featured ? ' • OFERTA' : '';
      const extra = item.kind === 'bundle' && item.included?.length
        ? ` • Incluye ${item.included.length} boosts`
        : item.kind === 'boost'
          ? ` • ${item.multiplier}x • ${asHours(item.durationMs)}`
          : '';
      const rarity = item.rarity ? ` • ${String(item.rarity).toUpperCase()}` : '';
      const priceLabel = discount > 0 ? `**${finalPrice} 🪙** *(antes: ${item.price} 🪙)*` : `**${item.price} 🪙**`;

      return `**${item.name}${suffix}**\n${item.description}\nPrecio: ${priceLabel}${extra}${rarity}${discount > 0 ? ` • -${discount}%` : ''}\nID: \`${item.id}\``;
    });

    embed.addFields({
      name: `${section.emoji} ${section.title}`,
      value: lines.join('\n\n'),
      inline: false
    });
  });

  return { catalog, embed };
}

module.exports = {
  name: 'shop',
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Tienda premium del servidor')
    .addStringOption(o =>
      o.setName('id')
        .setDescription('ID del item a comprar directamente')
        .setRequired(false)
    ),

  async execute(interaction) {
    const cfg = readConfig();
    const profiles = readProfiles();
    const userData = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const { catalog, embed } = buildShopEmbed(cfg, userData);
    const buyId = interaction.options.getString('id');

    if (buyId) {
      const item = findItemById(catalog, buyId);
      if (!item) return interaction.reply({ content: 'ID inválido.', ephemeral: true });

      const finalPrice = getFinalPrice(item, userData);
      const bal = getBalance(interaction.guildId, interaction.user.id);
      if (bal.coins < finalPrice) return interaction.reply({ content: 'Fondos insuficientes.', ephemeral: true });

      const success = subtractCoins(interaction.guildId, interaction.user.id, finalPrice);
      if (!success) return interaction.reply({ content: 'Error al procesar pago.', ephemeral: true });

      let purchaseSummary = `✅ Comprado: **${item.name}**`;
      let confirmFields = [];

      if (item.kind === 'bundle' && item.included?.length) {
        item.included.forEach(includedId => {
          const includedBoost = findItemById(catalog, includedId) || { ...((cfg.xpBoosts || {})[includedId] || {}), id: includedId };
          if (!includedBoost || (!includedBoost.multiplier && !includedBoost.durationMs && !includedBoost.name)) return;

          grantBoostToUser(interaction.guildId, interaction.user.id, {
            id: includedId,
            multiplier: Number(includedBoost.multiplier) || 1,
            durationMs: Number(includedBoost.durationMs) || 3600000
          }, 1);
        });
        purchaseSummary = `✅ Comprado el pack: **${item.name}**`;
        confirmFields = [
          { name: 'Incluye', value: `${item.included.length} boosts`, inline: true },
          { name: 'Precio', value: `${finalPrice} 🪙${getDiscountForUser(item, userData) > 0 ? ` (-${getDiscountForUser(item, userData)}%)` : ''}`, inline: true }
        ];
      } else {
        grantBoostToUser(interaction.guildId, interaction.user.id, item, 1);
        confirmFields = [
          { name: 'Multiplicador', value: `${item.multiplier}x`, inline: true },
          { name: 'Duración', value: asHours(item.durationMs), inline: true },
          { name: 'Precio', value: `${finalPrice} 🪙${getDiscountForUser(item, userData) > 0 ? ` (-${getDiscountForUser(item, userData)}%)` : ''}`, inline: true }
        ];
      }

      const purchaseEmbed = new EmbedBuilder()
        .setTitle('Compra realizada')
        .setColor(getRarityColor(item.rarity))
        .setDescription(purchaseSummary)
        .addFields(...confirmFields);

      return interaction.reply({ embeds: [purchaseEmbed], ephemeral: true });
    }

    const rows = [];
    let row = new ActionRowBuilder();
    let i = 0;
    let rowCount = 0;

    catalog.forEach(item => {
      if (i > 0 && i % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder();
        rowCount++;
        if (rowCount >= 5) return;
      }

      if (rowCount < 5) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`shop_buy_${item.id}`)
            .setLabel(item.name.length > 18 ? `${item.name.slice(0, 17)}…` : item.name)
            .setStyle(item.featured ? ButtonStyle.Success : ButtonStyle.Primary)
        );
        i++;
      }
    });

    if (row.components && row.components.length > 0 && rowCount < 5) rows.push(row);
    return interaction.reply({ embeds: [embed], components: rows.length ? rows : [] });
  },

  async handleButton(interaction) {
    const cfg = readConfig();
    const profiles = readProfiles();
    const userData = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const catalog = normalizeCatalog(cfg);
    const id = interaction.customId.replace('shop_buy_', '');
    const item = findItemById(catalog, id);

    if (!item) return interaction.reply({ content: 'ID inválido.', ephemeral: true });

    const finalPrice = getFinalPrice(item, userData);
    const bal = getBalance(interaction.guildId, interaction.user.id);
    if (bal.coins < finalPrice) return interaction.reply({ content: 'Fondos insuficientes.', ephemeral: true });

    const success = subtractCoins(interaction.guildId, interaction.user.id, finalPrice);
    if (!success) return interaction.reply({ content: 'Error al procesar pago.', ephemeral: true });

    if (item.kind === 'bundle' && item.included?.length) {
      item.included.forEach(includedId => {
        const includedBoost = findItemById(catalog, includedId) || { ...((cfg.xpBoosts || {})[includedId] || {}), id: includedId };
        if (!includedBoost || (!includedBoost.multiplier && !includedBoost.durationMs && !includedBoost.name)) return;

        grantBoostToUser(interaction.guildId, interaction.user.id, {
          id: includedId,
          multiplier: Number(includedBoost.multiplier) || 1,
          durationMs: Number(includedBoost.durationMs) || 3600000
        }, 1);
      });

      const bundleEmbed = new EmbedBuilder()
        .setTitle('🎁 Pack comprado')
        .setColor(getRarityColor(item.rarity))
        .setDescription(`✅ Compraste **${item.name}**.`)
        .addFields(
          { name: 'Incluye', value: `${item.included.length} boosts`, inline: true },
          { name: 'Precio', value: `${finalPrice} 🪙${getDiscountForUser(item, userData) > 0 ? ` (-${getDiscountForUser(item, userData)}%)` : ''}`, inline: true }
        );

      return interaction.reply({ embeds: [bundleEmbed], ephemeral: true });
    }

    grantBoostToUser(interaction.guildId, interaction.user.id, item, 1);

    const embed = new EmbedBuilder()
      .setTitle('Compra de Boost XP')
      .setColor(getRarityColor(item.rarity))
      .setDescription(`✅ Comprado: **${item.name}**`)
      .addFields(
        { name: 'Multiplicador', value: `${item.multiplier}x`, inline: true },
        { name: 'Duración', value: asHours(item.durationMs), inline: true },
        { name: 'Precio', value: `${finalPrice} 🪙${getDiscountForUser(item, userData) > 0 ? ` (-${getDiscountForUser(item, userData)}%)` : ''}`, inline: true }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};