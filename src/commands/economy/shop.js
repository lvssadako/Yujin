const { createEmbed } = require('../../utils/ui');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { readConfig } = require('../../utils/configCache');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { getBalance, subtractCoins } = require('../../services/economy/index').economyService;
const { isStreakActive, STREAK_ACTIVATION_DAYS } = require('../../services/streak/streakService');

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
  const streakDiscount = isStreakActive(userData.streakDays) ? 10 : 0;
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

const { buildCatalogView } = require('../../utils/shopView');

function buildShopEmbed(cfg, userData, page = 0, ownerId = '') {
  const catalog = normalizeCatalog(cfg);
  return { catalog, ...buildCatalogView(catalog, userData, getDiscountForUser, getFinalPrice, page, ownerId) };
}

module.exports = {
  name: 'shop',
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Explora boosts, packs y ofertas para tu progreso.')
    .addStringOption(o =>
      o.setName('id')
        .setDescription('ID del item a comprar directamente')
        .setRequired(false)
    ),

  async execute(interaction) {
    const cfg = readConfig();
    const profiles = readProfiles();
    const userData = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const { catalog, embed, components } = buildShopEmbed(cfg, userData, 0, interaction.user.id);
    const buyId = interaction.options.getString('id');

    if (buyId) {
      const item = findItemById(catalog, buyId);
      if (!item) return interaction.reply({ content: 'No encontré ese producto. Abre /shop para consultar los IDs disponibles.', ephemeral: true });

      const finalPrice = getFinalPrice(item, userData);
      const bal = getBalance(interaction.guildId, interaction.user.id);
      if (bal.coins < finalPrice) return interaction.reply({ content: 'No tienes suficientes monedas en la billetera. Consulta /balance o retira monedas con /bank withdraw.', ephemeral: true });

      const success = subtractCoins(interaction.guildId, interaction.user.id, finalPrice);
      if (!success) return interaction.reply({ content: 'No pude completar la compra. Revisa tu saldo antes de intentarlo de nuevo.', ephemeral: true });

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

      const purchaseEmbed = createEmbed()
        .setTitle('Compra realizada')
        .setColor(getRarityColor(item.rarity))
        .setDescription(purchaseSummary)
        .addFields(...confirmFields);

      return interaction.reply({ embeds: [purchaseEmbed], ephemeral: true });
    }

    return interaction.reply({ embeds: [embed], components });
  },

  async handleButton(interaction) {
    if (interaction.customId.startsWith('shop_page_')) {
      const match = /^shop_page_(\d{17,20})_(-?\d+)$/.exec(interaction.customId);
      if (!match || match[1] !== interaction.user.id) return interaction.reply({ content: 'Abre /shop o &shop para explorar tu propia tienda.', flags: 64 });
      const profiles = readProfiles();
      const userData = ensureUser(profiles, interaction.guildId, interaction.user.id);
      const view = buildShopEmbed(readConfig(), userData, Number(match[2]), interaction.user.id);
      return interaction.update({ embeds: [view.embed], components: view.components });
    }
    const cfg = readConfig();
    const profiles = readProfiles();
    const userData = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const catalog = normalizeCatalog(cfg);
    const id = interaction.customId.replace('shop_buy_', '');
    const item = findItemById(catalog, id);

    if (!item) return interaction.reply({ content: 'No encontré ese producto. Abre /shop para consultar los IDs disponibles.', ephemeral: true });

    const finalPrice = getFinalPrice(item, userData);
    const bal = getBalance(interaction.guildId, interaction.user.id);
    if (bal.coins < finalPrice) return interaction.reply({ content: 'No tienes suficientes monedas en la billetera. Consulta /balance o retira monedas con /bank withdraw.', ephemeral: true });

    const success = subtractCoins(interaction.guildId, interaction.user.id, finalPrice);
    if (!success) return interaction.reply({ content: 'No pude completar la compra. Revisa tu saldo antes de intentarlo de nuevo.', ephemeral: true });

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

      const bundleEmbed = createEmbed()
        .setTitle('Pack comprado')
        .setColor(getRarityColor(item.rarity))
        .setDescription(`✅ Compraste **${item.name}**.`)
        .addFields(
          { name: 'Incluye', value: `${item.included.length} boosts`, inline: true },
          { name: 'Precio', value: `${finalPrice} 🪙${getDiscountForUser(item, userData) > 0 ? ` (-${getDiscountForUser(item, userData)}%)` : ''}`, inline: true }
        );

      return interaction.reply({ embeds: [bundleEmbed], ephemeral: true });
    }

    grantBoostToUser(interaction.guildId, interaction.user.id, item, 1);

    const embed = createEmbed()
      .setTitle('Boost comprado')
      .setColor(getRarityColor(item.rarity))
      .setDescription(`✅ Comprado: **${item.name}**`)
      .addFields(
        { name: 'Multiplicador', value: `${item.multiplier}x`, inline: true },
        { name: 'Duración', value: asHours(item.durationMs), inline: true },
        { name: 'Precio', value: `${finalPrice} 🪙${getDiscountForUser(item, userData) > 0 ? ` (-${getDiscountForUser(item, userData)}%)` : ''}`, inline: true }
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },

  async executePrefix(message, args, client) {
    const cfg = readConfig();
    const profiles = readProfiles();
    const userData = ensureUser(profiles, message.guild.id, message.author.id);
    const { catalog, embed, components } = buildShopEmbed(cfg, userData, 0, message.author.id);
    const buyId = args[0];

    if (buyId) {
      const item = findItemById(catalog, buyId);
      if (!item) return message.reply('No encontré ese producto. Abre &shop para consultar los IDs disponibles.');

      const finalPrice = getFinalPrice(item, userData);
      const bal = getBalance(message.guild.id, message.author.id);
      if (bal.coins < finalPrice) return message.reply('No tienes suficientes monedas en la billetera. Consulta &balance o retira monedas con &bank withdraw.');

      const success = subtractCoins(message.guild.id, message.author.id, finalPrice);
      if (!success) return message.reply('No pude completar la compra. Revisa tu saldo antes de intentarlo de nuevo.');

      if (item.kind === 'bundle' && item.included?.length) {
        item.included.forEach(includedId => {
          const includedBoost = findItemById(catalog, includedId) || { ...((cfg.xpBoosts || {})[includedId] || {}), id: includedId };
          if (!includedBoost || (!includedBoost.multiplier && !includedBoost.durationMs && !includedBoost.name)) return;
          grantBoostToUser(message.guild.id, message.author.id, {
            id: includedId,
            multiplier: Number(includedBoost.multiplier) || 1,
            durationMs: Number(includedBoost.durationMs) || 3600000
          }, 1);
        });
      } else {
        grantBoostToUser(message.guild.id, message.author.id, item, 1);
      }

      const purchaseEmbed = createEmbed()
        .setTitle('Compra realizada')
        .setColor(getRarityColor(item.rarity))
        .setDescription(`Has adquirido con éxito: **${item.name}** por **${finalPrice} 🪙**.`)
        .setTimestamp();

      return message.reply({ embeds: [purchaseEmbed] });
    }

    return message.reply({ embeds: [embed], components });
  }
};