const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { addChests, removeChest, getChestCount } = require('../utils/chestStore');
const { getBalance, removeCoins } = require('../utils/economy');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
const { updateMissionProgress } = require('../utils/dailyMissions');
const { rollBadge, RARITIES } = require('../utils/badgeRoller');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chest')
    .setDescription('Sistema de cofres con badges aleatorios')
    .addSubcommand(s => s
      .setName('buy')
      .setDescription('Comprar cofres con monedas')
      .addIntegerOption(o => o
        .setName('cantidad')
        .setDescription('Cantidad de cofres (1000🪙 cada uno)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(20)))
    .addSubcommand(s => s
      .setName('open')
      .setDescription('Abrir cofres de tu inventario')
      .addIntegerOption(o => o
        .setName('cantidad')
        .setDescription('Cantidad de cofres a abrir (1-10)')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)))
    .addSubcommand(s => s
      .setName('balance')
      .setDescription('Ver tus cofres y monedas')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    if (sub === 'balance') {
      await interaction.deferReply();
      const count = getChestCount(guildId, userId);
      const { coins, gems } = getBalance(guildId, userId);
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle('<:chest:1439431665704239236> Tu Inventario')
        .addFields(
          { name: '<:chest:1439431665704239236> Cofres', value: String(count), inline: true },
          { name: '🪙 Monedas', value: String(coins), inline: true },
          { name: '💎 Gemas', value: String(gems || 0), inline: true }
        )
        .setFooter({ text: 'Usa /chest buy para comprar cofres' })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'buy') {
      await interaction.deferReply();
      const amount = interaction.options.getInteger('cantidad');
      return await handleChestBuy(interaction, amount, true); // true = usar editReply
    }

    if (sub === 'open') {
      await interaction.deferReply();
      const amount = interaction.options.getInteger('cantidad') || 1;
      return await handleChestOpen(interaction, amount, false, false); // false = usar editReply
    }
  },

  async executePrefix(message, args, client) {
    if (!message.guild || !message.member) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }
    const sub = (args[0] || '').toLowerCase();
    const cantidad = parseInt(args[1], 10) || 1;
    const fakeInteraction = {
      guild: message.guild,
      guildId: message.guild.id,
      user: message.author,
      channel: message.channel,
      deferReply: async () => {},
      editReply: async (data) => message.reply(data),
      reply: async (data) => message.reply(data),
      options: {
        getSubcommand: () => sub || 'balance',
        getInteger: () => cantidad,
      }
    };

    if (sub === 'balance' || !sub) {
      await module.exports.execute(fakeInteraction);
    } else if (sub === 'buy') {
      if (isNaN(cantidad) || cantidad < 1 || cantidad > 20) {
        return message.reply('❌ Especifica una cantidad válida (1-20).');
      }
      await module.exports.execute(fakeInteraction);
    } else if (sub === 'open') {
      if (isNaN(cantidad) || cantidad < 1 || cantidad > 10) {
        return message.reply('❌ Especifica una cantidad válida (1-10).');
      }
      await module.exports.execute(fakeInteraction);
    } else {
      return message.reply('❌ Subcomando no reconocido. Usa: balance, buy, open');
    }
  }
};

// --- Lógica de abrir cofres y botones ---
async function handleChestOpen(interaction, cantidad, isButton = false, useReply = false) {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const available = getChestCount(guildId, userId);

    // Error: cofres insuficientes
    if (available < cantidad) {
      const msg = `❌ Cofres insuficientes. Tienes ${available}, necesitas ${cantidad}. Compra con /chest buy.`;
      if (isButton) {
        return interaction.reply({ content: msg, ephemeral: true });
      } else {
        return interaction.editReply(msg);
      }
    }

    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    if (!user.badgeStacks) user.badgeStacks = {};

    const results = [];
    const newBadges = [];
    const duplicates = [];

    for (let i = 0; i < cantidad; i++) {
      if (!removeChest(guildId, userId)) break;
      const badge = rollBadge(profiles);
      if (!badge) continue;
      results.push(badge);

      if (!badge.id) continue;

      if (!user.earnedBadges.includes(badge.id)) {
        user.earnedBadges.push(badge.id);
        user.badgeStacks[badge.id] = 1;
        newBadges.push(badge);
      } else {
        user.badgeStacks[badge.id] = (user.badgeStacks[badge.id] || 1) + 1;
        duplicates.push(badge);
      }
    }

    writeProfiles(profiles);
    updateMissionProgress(interaction.guild, userId, 'chests_opened', results.length);

    // Error: no hay badges
    if (!results.length) {
      const msg = '❌ No hay badges disponibles.';
      if (isButton) {
        return interaction.reply({ content: msg, ephemeral: true });
      } else {
        return interaction.editReply(msg);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`🎁 Abriste ${results.length} cofre${results.length > 1 ? 's' : ''}`)
      .setFooter({ text: `Cofres restantes: ${getChestCount(guildId, userId)}` })
      .setTimestamp();

    const grouped = {};
    for (const badge of results) {
      const rarity = badge.rarity || 'common';
      (grouped[rarity] = grouped[rarity] || []).push(badge);
    }

    let desc = '';
    const order = ['legendary', 'epic', 'rare', 'common'];
    for (const rarity of order) {
      if (!grouped[rarity]) continue;
      const emoji = RARITIES[rarity]?.emoji || '⚪';
      desc += `\n**${emoji} ${rarity.toUpperCase()}** (${grouped[rarity].length})\n`;
      for (const badge of grouped[rarity]) {
        const isNew = newBadges.includes(badge);
        const stack = user.badgeStacks[badge.id] || 1;
        const stackText = stack > 1 ? ` x${stack}` : '';
        desc += `${isNew ? '✨' : '⚠️'} ${badge.icon || '🏅'} ${badge.name}${stackText}${isNew ? '' : ' (dup)'}\n`;
      }
    }
    embed.setDescription(desc);

    embed.addFields(
      { name: '✨ Nuevos', value: String(newBadges.length), inline: true },
      { name: '⚠️ Duplicados', value: String(duplicates.length), inline: true },
      { name: '📊 Total', value: String(results.length), inline: true }
    );

    // Botones bonitos y funcionales
    const openMoreId = `chest_open_more_${cantidad}`;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(openMoreId)
        .setLabel(`Abrir otros ${cantidad}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('<:chest:1439431665704239236>')
        .setDisabled(getChestCount(guildId, userId) < cantidad),
      new ButtonBuilder()
        .setCustomId('chest_buy')
        .setLabel('Comprar más cofres')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🪙'),
      new ButtonBuilder()
        .setCustomId('chest_close')
        .setLabel('Cerrar')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

    // Enviar mensaje nuevo cada vez que se abren cofres
    await interaction.channel.send({ embeds: [embed], components: [row] });

    // Limpia el mensaje anterior (si es botón, solo actualiza para quitar botones)
    if (isButton) {
      await interaction.update({ content: '¡Cofres abiertos!', components: [] });
    } else if (!useReply) {
      await interaction.editReply({ content: '¡Cofres abiertos!', components: [] });
    }
  } catch (err) {
    console.error('Error dentro de handleChestOpen:', err);
    if (isButton && !interaction.deferred && !interaction.replied) {
      try { await interaction.deferUpdate(); } catch {}
    }
  }
}

// --- Lógica de compra desde modal o comando ---
async function handleChestBuy(interaction, amount, useEditReply = false) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const cost = amount * 1000;
  const { coins } = getBalance(guildId, userId);
  if (coins < cost) {
    const msg = `❌ Necesitas ${cost}🪙 (tienes ${coins}🪙).`;
    if (useEditReply) return interaction.editReply(msg);
    return interaction.reply({ content: msg, ephemeral: true });
  }
  if (!removeCoins(guildId, userId, cost)) {
    const msg = '❌ Error al procesar compra.';
    if (useEditReply) return interaction.editReply(msg);
    return interaction.reply({ content: msg, ephemeral: true });
  }
  const total = addChests(guildId, userId, amount);
  const msg = `✅ Compraste **${amount}** cofres por **${cost}🪙**. Ahora tienes **${total}** cofres.`;
  if (useEditReply) return interaction.editReply(msg);
  return interaction.reply({ content: msg, ephemeral: true });
}

module.exports.handleChestOpen = handleChestOpen;
module.exports.handleChestBuy = handleChestBuy;