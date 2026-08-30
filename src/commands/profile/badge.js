const logger = require('../src/utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../../../utils/profileStore');
const { readLevels } = require('../../../services/level').levelService;
const { readShop, writeShop, rotateShop, ensureRotation } = require('../../../utils/badgeShop');
const { getBalance, removeCoins } = require('../../../services/economy').economyService;
const { readConfig } = require('../../../utils/configCache');

const RARITIES = {
  common: { emoji: '⚪', color: 0x9E9E9E },
  rare: { emoji: '🔵', color: 0x2196F3 },
  epic: { emoji: '🟣', color: 0x9C27B0 },
  legendary: { emoji: '🟡', color: 0xFFD700 }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('badge')
    .setDescription('Sistema de insignias')
    .addSubcommand(s => s
      .setName('create')
      .setDescription('Crear insignia (admin)')
      .addStringOption(o => o.setName('id').setDescription('ID única').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Nombre').setRequired(true))
      .addStringOption(o => o.setName('icon').setDescription('Emoji o URL').setRequired(true))
      .addStringOption(o => o.setName('type').setDescription('Tipo de insignia').setRequired(true)
        .addChoices(
          { name: '🎁 Manual (admin otorga)', value: 'manual' },
          { name: '🏆 Logro (auto-desbloqueable)', value: 'achievement' },
          { name: '🛒 Tienda (comprable)', value: 'shop' },
          { name: '✨ Custom (eventos especiales)', value: 'custom' }
        ))
      .addStringOption(o => o.setName('rarity').setDescription('Rareza').setRequired(false)
        .addChoices(
          { name: '⚪ Común', value: 'common' },
          { name: '🔵 Rara', value: 'rare' },
          { name: '🟣 Épica', value: 'epic' },
          { name: '🟡 Legendaria', value: 'legendary' }
        ))
      .addStringOption(o => o.setName('desc').setDescription('Descripción').setRequired(false))
      .addIntegerOption(o => o.setName('price').setDescription('Precio (solo shop)').setRequired(false))
      .addIntegerOption(o => o.setName('min_level').setDescription('Nivel mínimo (logro)').setRequired(false))
      .addIntegerOption(o => o.setName('min_messages').setDescription('Mensajes mínimos (logro)').setRequired(false))
      .addIntegerOption(o => o.setName('min_voice_hours').setDescription('Horas en voz (logro)').setRequired(false))
      .addIntegerOption(o => o.setName('min_streak').setDescription('Racha mínima (logro)').setRequired(false))
    )
    .addSubcommand(s => s
      .setName('edit')
      .setDescription('Editar insignia existente (admin)')
      .addStringOption(o => o.setName('id').setDescription('ID de la insignia').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('field').setDescription('Campo a editar').setRequired(true)
        .addChoices(
          { name: 'Nombre', value: 'name' },
          { name: 'Icono', value: 'icon' },
          { name: 'Descripción', value: 'desc' },
          { name: 'Tipo', value: 'type' },
          { name: 'Rareza', value: 'rarity' },
          { name: 'Precio (shop)', value: 'price' },
          { name: 'Nivel mínimo (logro)', value: 'minLevel' },
          { name: 'Mensajes mínimos (logro)', value: 'minMessages' },
          { name: 'Horas en voz (logro)', value: 'minVoiceHours' },
          { name: 'Racha mínima (logro)', value: 'minStreak' }
        ))
      .addStringOption(o => o.setName('value').setDescription('Nuevo valor').setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription('Eliminar insignia (admin)')
      .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('give').setDescription('Otorgar insignia (admin)')
      .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('revoke').setDescription('Quitar insignia (admin)')
      .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('equip').setDescription('Equipar insignia')
      .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('unequip').setDescription('Desequipar insignia')
      .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('shop').setDescription('Ver tienda de insignias'))
    .addSubcommand(s => s
      .setName('shopforce')
      .setDescription('Forzar rotación de la tienda (admins)'))
    .addSubcommand(s => s.setName('buy').setDescription('Comprar insignia de la tienda')
      .addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName('catalog').setDescription('Ver catálogo completo')
      .addStringOption(o => o.setName('filter').setDescription('Filtrar por tipo').setRequired(false)
        .addChoices(
          { name: 'Manual', value: 'manual' },
          { name: 'Logros', value: 'achievement' },
          { name: 'Tienda', value: 'shop' },
          { name: 'Custom', value: 'custom' }
        )))
    .addSubcommand(s => s.setName('progress').setDescription('Ver progreso de logros')
      .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(false)))
    .addSubcommand(s => s
      .setName('mine')
      .setDescription('Ver tus insignias obtenidas y equipadas'))
    .addSubcommand(s => s.setName('check').setDescription('Verificar logros desbloqueables')
      .addUserOption(o => o.setName('user').setDescription('Usuario (admin)').setRequired(false)))
    .addSubcommand(s => s
      .setName('feature')
      .setDescription('Destacar una insignia en tu perfil')
      .addStringOption(o => o.setName('id').setDescription('ID de la insignia a destacar').setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s
      .setName('unfeature')
      .setDescription('Quitar insignia destacada'))
    .addSubcommand(s => s
      .setName('trade')
      .setDescription('Intercambiar badge con otro usuario')
      .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
      .addStringOption(o => o.setName('offer').setDescription('Badge que ofreces').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('request').setDescription('Badge que solicitas').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction) {
    try {
      // ✅ Timeout de 2 segundos (evita que Discord cierre la conexión)
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 2000)
      );

      const mainPromise = (async () => {
        const profiles = readProfiles();
        const badges = profiles.badges || {};
        const focused = interaction.options.getFocused(true);
        const sub = interaction.options.getSubcommand();

        let choices = [];

      if (focused.name === 'id' || focused.name === 'offer' || focused.name === 'request') {

        if (sub === 'equip' || sub === 'unequip' || sub === 'feature' || sub === 'unfeature') {
          const user = ensureUser(profiles, interaction.guildId, interaction.user.id);
          const uniqueBadges = [...new Set(user.earnedBadges || [])];
          choices = uniqueBadges.map(id => ({
            name: id, // ✅ Solo el ID
            value: id
          }));

        } else if (sub === 'buy') {
          const shop = readShop();
          choices = (shop.rotation || []).map(item => ({
            name: item.id, // ✅ Solo el ID
            value: item.id
          }));

        } else if (sub === 'edit' || sub === 'delete' || sub === 'give' || sub === 'revoke') {
          choices = Object.keys(badges).map(id => ({
            name: id, // ✅ Solo el ID
            value: id
          }));

        } else if (sub === 'trade') {
          const user = ensureUser(profiles, interaction.guildId, interaction.user.id);
          
          if (focused.name === 'offer') {
            const uniqueBadges = [...new Set(user.earnedBadges || [])];
            choices = uniqueBadges.map(id => ({
              name: id, // ✅ Solo el ID
              value: id
            }));
          } else if (focused.name === 'request') {
            choices = Object.keys(badges).map(id => ({
              name: id, // ✅ Solo el ID
              value: id
            }));
          }

        } else {
          choices = Object.keys(badges).map(id => ({
            name: id, // ✅ Solo el ID
            value: id
          }));
        }
      }

      // ✅ Filtrar por texto escrito
        const query = (focused.value || '').toLowerCase();
        const filtered = choices
          .filter(c => c.name.toLowerCase().includes(query))
          .slice(0, 25);

        return filtered;
      })();

      const filtered = await Promise.race([mainPromise, timeoutPromise]);
      await interaction.respond(filtered);
    } catch (err) {
      logger.error('[badge autocomplete] Error:', err.message);
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    if (['mine', 'progress', 'check'].includes(sub)) {
      await interaction.deferReply({ flags: 64 });
    } else {
      await interaction.deferReply();
    }
    
    const profiles = readProfiles();
    profiles.badges ||= {};

    if (['create', 'edit', 'delete', 'give', 'revoke'].includes(sub)) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply('❌ Necesitas permisos de administrador');
      }
    }

    if (sub === 'create') {
      const id = interaction.options.getString('id');
      const name = interaction.options.getString('name');
      const icon = interaction.options.getString('icon');
      const type = interaction.options.getString('type');
      const rarity = interaction.options.getString('rarity') || 'common';
      const desc = interaction.options.getString('desc') || '';
      const price = interaction.options.getInteger('price');
      
      const badge = { id, name, icon, desc, type, rarity };
      
      if (type === 'shop' && price) {
        badge.price = price;
        badge.currency = 'coins';
      }
      
      if (type === 'achievement') {
        badge.autoGrant = {};
        const minLevel = interaction.options.getInteger('min_level');
        const minMsg = interaction.options.getInteger('min_messages');
        const minVoice = interaction.options.getInteger('min_voice_hours');
        const minStreak = interaction.options.getInteger('min_streak');
        
        if (minLevel) badge.autoGrant.minLevel = minLevel;
        if (minMsg) badge.autoGrant.minMessages = minMsg;
        if (minVoice) badge.autoGrant.minVoiceMinutes = minVoice * 60;
        if (minStreak) badge.autoGrant.minStreakDays = minStreak;
      }
      
      profiles.badges[id] = badge;
      writeProfiles(profiles);
      
      const rarityInfo = RARITIES[rarity] || RARITIES.common;
      return interaction.editReply(`✅ Insignia creada: ${rarityInfo.emoji} **${name}** [${type}]`);
    }

    if (sub === 'edit') {
      const id = interaction.options.getString('id');
      const field = interaction.options.getString('field');
      const value = interaction.options.getString('value');

      if (!profiles.badges[id]) {
        return interaction.editReply('❌ Insignia no encontrada');
      }

      const badge = profiles.badges[id];

      if (field === 'name') badge.name = value;
      else if (field === 'icon') badge.icon = value;
      else if (field === 'desc') badge.desc = value;
      else if (field === 'type') {
        if (!['manual', 'achievement', 'shop', 'custom'].includes(value)) {
          return interaction.editReply('❌ Tipo inválido');
        }
        badge.type = value;
      }
      else if (field === 'rarity') {
        if (!['common', 'rare', 'epic', 'legendary'].includes(value)) {
          return interaction.editReply('❌ Rareza inválida');
        }
        badge.rarity = value;
      }
      else if (field === 'price') {
        const num = parseInt(value);
        if (isNaN(num) || num < 0) {
          return interaction.editReply('❌ Precio debe ser un número positivo');
        }
        badge.price = num;
      }
      else if (field === 'minLevel' || field === 'minMessages' || field === 'minStreak') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          return interaction.editReply('❌ Valor inválido');
        }
        badge.autoGrant = badge.autoGrant || {};
        if (field === 'minLevel') badge.autoGrant.minLevel = num;
        else if (field === 'minMessages') badge.autoGrant.minMessages = num;
        else if (field === 'minStreak') badge.autoGrant.minStreakDays = num;
      }
      else if (field === 'minVoiceHours') {
        const num = parseInt(value);
        if (isNaN(num) || num < 1) {
          return interaction.editReply('❌ Valor inválido');
        }
        badge.autoGrant = badge.autoGrant || {};
        badge.autoGrant.minVoiceMinutes = num * 60;
      }

      writeProfiles(profiles);
      return interaction.editReply(`✅ Insignia **${badge.name}** actualizada`);
    }

    if (sub === 'delete') {
      const id = interaction.options.getString('id');
      if (!profiles.badges[id]) {
        return interaction.editReply('❌ Insignia no encontrada');
      }
      delete profiles.badges[id];
      writeProfiles(profiles);
      return interaction.editReply('✅ Insignia eliminada');
    }

    if (sub === 'give') {
      const user = interaction.options.getUser('user');
      const id = interaction.options.getString('id');
      
      if (!profiles.badges[id]) {
        return interaction.editReply('❌ Insignia no encontrada');
      }
      
      const u = ensureUser(profiles, interaction.guildId, user.id);
      if (!u.earnedBadges.includes(id)) {
        u.earnedBadges.push(id);
        writeProfiles(profiles);
      }
      
      return interaction.editReply(`✅ Insignia **${profiles.badges[id].name}** otorgada a ${user}`);
    }

    if (sub === 'revoke') {
      const user = interaction.options.getUser('user');
      const id = interaction.options.getString('id');
      
      const u = ensureUser(profiles, interaction.guildId, user.id);
      
      // ✅ Inicializar stacks si no existe
      if (!u.badgeStacks) u.badgeStacks = {};
      
      // ✅ Reducir stack en lugar de eliminar
      if (u.badgeStacks[id] && u.badgeStacks[id] > 1) {
        u.badgeStacks[id]--;
        writeProfiles(profiles);
        return interaction.editReply(`✅ Reducido stack de **${profiles.badges[id]?.name}** a x${u.badgeStacks[id]}`);
      } else {
        // Si solo tiene 1, eliminar completamente
        u.earnedBadges = u.earnedBadges.filter(b => b !== id);
        u.equippedBadges = u.equippedBadges.filter(b => b !== id);
        delete u.badgeStacks[id];
        writeProfiles(profiles);
        return interaction.editReply(`✅ Insignia completamente removida de ${user}`);
      }
    }

    if (sub === 'equip') {
      const id = interaction.options.getString('id');
      const u = ensureUser(profiles, interaction.guildId, interaction.user.id);
      
      if (!u.earnedBadges.includes(id)) {
        return interaction.editReply('❌ No tienes esta insignia');
      }
      
      if (u.equippedBadges.includes(id)) {
        return interaction.editReply('⚠️ Ya equipada');
      }
      
      if (u.equippedBadges.length >= 5) {
        return interaction.editReply('❌ Máximo 5 equipadas');
      }
      
      u.equippedBadges.push(id);
      writeProfiles(profiles);
      
      return interaction.editReply(`✅ Insignia **${profiles.badges[id]?.name}** equipada`);
    }

    if (sub === 'unequip') {
      const id = interaction.options.getString('id');
      const u = ensureUser(profiles, interaction.guildId, interaction.user.id);
      
      u.equippedBadges = u.equippedBadges.filter(b => b !== id);
      writeProfiles(profiles);
      
      return interaction.editReply('✅ Insignia desequipada');
    }

    if (sub === 'feature') {
      const id = interaction.options.getString('id');
      const u = ensureUser(profiles, interaction.guildId, interaction.user.id);
      
      if (!u.earnedBadges?.includes(id)) {
        return interaction.editReply('❌ No tienes esta insignia');
      }
      
      u.featuredBadge = id;
      writeProfiles(profiles);
      
      const badge = profiles.badges[id];
      return interaction.editReply(`✨ **${badge.name}** ahora es tu insignia destacada`);
    }
    
    if (sub === 'unfeature') {
      const u = ensureUser(profiles, interaction.guildId, interaction.user.id);
      delete u.featuredBadge;
      writeProfiles(profiles);
      
      return interaction.editReply('✅ Insignia destacada removida');
    }

    if (sub === 'shop') {
      const shop = readShop();
      let rotation = shop.rotation;
      
      if (!rotation || !rotation.length) {
        rotateShop(profiles.badges || {});
        return interaction.editReply('🛒 Tienda generada. Usa el comando de nuevo.');
      }

      const { coins } = getBalance(interaction.guildId, interaction.user.id);

      // ✅ Embed sin barra (color 0x2b2d31 = gris Discord)
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31) // Sin barra visible
        .setTitle('🛒 Tienda de Insignias')
        .setDescription(
          `Selecciona una insignia del menú desplegable para comprarla.\n` +
          `**Tu balance:** ${coins} 🪙\n` +
          `**Rotación:** cada 24 horas`
        )
        .setTimestamp();

      // ✅ Mostrar badges en el embed
      let badgeList = '';
      for (const item of rotation) {
        const badge = profiles.badges[item.id];
        if (!badge) continue;

        const rarityEmoji = RARITIES[badge.rarity]?.emoji || '⚪';
        const stockText = item.stock > 0 ? `Stock: ${item.stock}` : '❌ AGOTADO';
        
        badgeList += `\n${rarityEmoji} ${badge.icon} **${badge.name}**\n`;
        badgeList += `${badge.desc || 'Sin descripción'}\n`;
        badgeList += `💰 **${item.price}** 🪙 • ${stockText}\n`;
      }

      embed.addFields({
        name: '📦 Badges Disponibles',
        value: badgeList || 'Sin badges en rotación',
        inline: false
      });

      const timeLeft = shop.rotationInterval - (Date.now() - shop.lastRotation);
      const hoursLeft = Math.floor(timeLeft / 3600000);
      const minsLeft = Math.floor((timeLeft % 3600000) / 60000);
      embed.setFooter({ text: `Rota en: ${hoursLeft}h ${minsLeft}m` });

      // ✅ Select Menu para elegir badge
      const { StringSelectMenuBuilder } = require('discord.js');
      
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('shop_select_badge')
        .setPlaceholder('🛒 Selecciona una insignia para comprar')
        .setMinValues(1)
        .setMaxValues(1);

      for (const item of rotation) {
        const badge = profiles.badges[item.id];
        if (!badge) continue;
        
        const stockText = item.stock > 0 ? `Stock:${item.stock}` : 'AGOTADO';
        selectMenu.addOptions({
          label: `${badge.name}`,
          description: `${item.price} 🪙 • ${stockText}`,
          value: badge.id,
          emoji: badge.icon || '🏅'
        });
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const msg = await interaction.editReply({ 
        embeds: [embed], 
        components: [row] 
      });

      // ✅ Collector para compras
      const collector = msg.createMessageComponentCollector({ 
        componentType: ComponentType.StringSelect,
        time: 300_000 // 5 minutos
      });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: '❌ Solo quien usó el comando puede comprar', ephemeral: true });
        }

        const selectedId = i.values[0];
        const badge = profiles.badges[selectedId];
        const item = rotation.find(r => r.id === selectedId);

        if (!item || item.stock <= 0) {
          return i.reply({ content: '❌ Badge agotado', ephemeral: true });
        }

        const user = ensureUser(profiles, interaction.guildId, i.user.id);
        
        if (user.earnedBadges.includes(selectedId)) {
          return i.reply({ content: '⚠️ Ya tienes este badge', ephemeral: true });
        }

        const price = item.price;
        const { coins: currentCoins } = getBalance(interaction.guildId, i.user.id);

        if (currentCoins < price) {
          return i.reply({ 
            content: `❌ Necesitas ${price}🪙 (tienes ${currentCoins})`, 
            ephemeral: true 
          });
        }

        // ✅ Procesar compra
        if (!removeCoins(interaction.guildId, i.user.id, price)) {
          return i.reply({ content: '❌ Error al procesar pago', ephemeral: true });
        }

        item.stock -= 1;
        item.soldCount = (item.soldCount || 0) + 1;
        writeShop(shop);

        user.earnedBadges.push(selectedId);
        writeProfiles(profiles);

        // Actualizar embed
        const newEmbed = EmbedBuilder.from(embed);
        let updatedList = '';
        for (const r of rotation) {
          const b = profiles.badges[r.id];
          if (!b) continue;
          const rarity = RARITIES[b.rarity]?.emoji || '⚪';
          const stock = r.stock > 0 ? `Stock: ${r.stock}` : '❌ AGOTADO';
          updatedList += `\n${rarity} ${b.icon} **${b.name}**\n${b.desc || 'Sin descripción'}\n💰 **${r.price}** 🪙 • ${stock}\n`;
        }
        newEmbed.spliceFields(0, 1, { name: '📦 Badges Disponibles', value: updatedList });

        await interaction.editReply({ embeds: [newEmbed] });

        let replyMsg = `✅ Compraste **${badge.name}** por ${price}🪙\nStock restante: ${item.stock}`;

        // Notificar si agotado
        if (item.stock === 0) {
          replyMsg += '\n⚠️ Este badge se agotó';
          try {
            const cfg = readConfig();
            const channelId = cfg?.shopRotationChannelId;
            if (channelId) {
              const channel = interaction.client.channels.cache.get(channelId);
              if (channel) {
                await channel.send(`🛒 Badge agotado: ${badge.icon} **${badge.name}** (${badge.rarity})`);
              }
            }
          } catch {}
        }

        await i.reply({ content: replyMsg, ephemeral: true });
      });

      collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });

      return;
    }

    if (sub === 'shopforce') {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply('❌ Necesitas permisos de administrador');
      }
      const allBadges = profiles.badges || {};
      const rotation = rotateShop(allBadges);
      const shop = readShop();
      const list = rotation.map(r => {
        const b = allBadges[r.id];
        if (!b) return `• (faltante) ${r.id}`;
        return `• ${b.icon || '🏅'} ${b.name} (${b.rarity}) – ${r.price}🪙 Stock:${r.stock}`;
      }).join('\n') || 'Sin selección';
      const nextAt = new Date(shop.lastRotation + shop.rotationInterval).toLocaleString('es-ES');
      
      // ✅ Usar editReply (ya se hizo deferReply)
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2b2d31)
            .setTitle('🛒 Rotación forzada')
            .setDescription(list)
            .setFooter({ text: `Próxima rotación automática: ${nextAt}` })
            .setTimestamp()
        ]
      });
    }

    if (sub === 'buy') {
      const id = interaction.options.getString('id');
      const badge = profiles.badges[id];
      
      if (!badge || badge.type !== 'shop') {
        return interaction.editReply('❌ No está en tienda');
      }

      const user = ensureUser(profiles, interaction.guildId, interaction.user.id);
      
      if (user.earnedBadges.includes(id)) {
        return interaction.editReply('⚠️ Ya lo tienes');
      }

      const shop = readShop();
      const item = shop.rotation.find(r => r.id === id);
      
      if (!item) {
        return interaction.editReply('❌ No está en la rotación actual');
      }
      
      if (item.stock <= 0) {
        return interaction.editReply('❌ Agotado');
      }

      const price = item.price;
      
      if (!removeCoins(interaction.guildId, interaction.user.id, price)) {
        const { coins } = getBalance(interaction.guildId, interaction.user.id);
        return interaction.editReply(`❌ Necesitas ${price}🪙 (tienes ${coins})`);
      }

      item.stock -= 1;
      item.soldCount = (item.soldCount || 0) + 1;
      writeShop(shop);

      user.earnedBadges.push(id);
      writeProfiles(profiles);

      let msg = `✅ Compraste **${badge.name}** por ${price}🪙. Stock restante: ${item.stock}`;
      
      if (item.stock === 0) {
        msg += '\n⚠️ Badge agotado en la tienda.';
        
        try {
          const cfg = readConfig();
          const channelId = cfg?.shopRotationChannelId;
          if (channelId) {
            const channel = interaction.client.channels.cache.get(channelId);
            if (channel) {
              await channel.send(`🛒 Badge agotado: ${badge.icon || ''} **${badge.name}** (${badge.rarity})`);
            }
          }
        } catch (e) {
          logger.warn('No se pudo anunciar agotado:', e.message);
        }
      }

      return interaction.editReply(msg);
    }

    if (sub === 'trade') {
      const targetUser = interaction.options.getUser('user');
      const offerId = interaction.options.getString('offer');
      const requestId = interaction.options.getString('request');
      
      if (targetUser.id === interaction.user.id) {
        return interaction.editReply('❌ No puedes intercambiar contigo mismo');
      }
      
      if (targetUser.bot) {
        return interaction.editReply('❌ No puedes intercambiar con bots');
      }
      
      const u1 = ensureUser(profiles, interaction.guildId, interaction.user.id);
      const u2 = ensureUser(profiles, interaction.guildId, targetUser.id);
      
      if (!u1.earnedBadges.includes(offerId)) {
        return interaction.editReply('❌ No tienes el badge que ofreces');
      }
      
      if (!u2.earnedBadges.includes(requestId)) {
        return interaction.editReply(`❌ ${targetUser.username} no tiene el badge que solicitas`);
      }
      
      const b1 = profiles.badges[offerId];
      const b2 = profiles.badges[requestId];
      
      const embed = new EmbedBuilder()
        .setColor(0xFF9800)
        .setTitle('🔄 Solicitud de Intercambio')
        .setDescription(
          `**${interaction.user.username} ofrece:** ${b1.icon} ${b1.name}\n` +
          `**${targetUser.username} ofrece:** ${b2.icon} ${b2.name}\n\n` +
          `**Resultado:**\n` +
          `${interaction.user.username} recibirá: ${b2.icon} ${b2.name}\n` +
          `${targetUser.username} recibirá: ${b1.icon} ${b1.name}\n\n` +
          `${targetUser}, ¿aceptas?`
        );
      
      const accept = new ButtonBuilder()
        .setCustomId(`trade_accept_${interaction.id}`)
        .setLabel('✅ Aceptar')
        .setStyle(ButtonStyle.Success);
      
      const decline = new ButtonBuilder()
        .setCustomId(`trade_decline_${interaction.id}`)
        .setLabel('❌ Rechazar')
        .setStyle(ButtonStyle.Danger);
      
      const row = new ActionRowBuilder().addComponents(accept, decline);
      
      const msg = await interaction.editReply({ 
        content: `${targetUser}`,
        embeds: [embed], 
        components: [row],
        allowedMentions: { users: [targetUser.id] }
      });
      
      const collector = msg.createMessageComponentCollector({ time: 60000 });
      
      collector.on('collect', async i => {
        if (i.user.id !== targetUser.id) {
          return i.reply({ content: '❌ Solo el usuario mencionado puede responder', ephemeral: true });
        }
        
        if (i.customId.startsWith('trade_accept')) {
          u1.earnedBadges = u1.earnedBadges.filter(b => b !== offerId);
          u1.earnedBadges.push(requestId);
          
          u2.earnedBadges = u2.earnedBadges.filter(b => b !== requestId);
          u2.earnedBadges.push(offerId);
          
          if (u1.badgeStacks) {
            if (u1.badgeStacks[offerId] > 1) {
              u1.badgeStacks[offerId]--;
            } else {
              delete u1.badgeStacks[offerId];
            }
            u1.badgeStacks[requestId] = (u1.badgeStacks[requestId] || 0) + 1;
          }
          
          if (u2.badgeStacks) {
            if (u2.badgeStacks[requestId] > 1) {
              u2.badgeStacks[requestId]--;
            } else {
              delete u2.badgeStacks[requestId];
            }
            u2.badgeStacks[offerId] = (u2.badgeStacks[offerId] || 0) + 1;
          }
          
          writeProfiles(profiles);
          
          await i.update({
            content: `✅ Intercambio completado`,
            embeds: [new EmbedBuilder()
              .setColor(0x4CAF50)
              .setTitle('✅ Intercambio Exitoso')
              .setDescription(
                `${interaction.user.username} recibió: ${b2.icon} ${b2.name}\n` +
                `${targetUser.username} recibió: ${b1.icon} ${b1.name}`
              )
            ],
            components: []
          });
        } else {
          await i.update({
            content: '❌ Intercambio rechazado',
            embeds: [embed.setColor(0xF44336)],
            components: []
          });
        }
        
        collector.stop();
      });
      
      collector.on('end', (collected) => {
        if (!collected.size) {
          interaction.editReply({ 
            content: '⏰ Tiempo agotado',
            components: [] 
          }).catch(() => {});
        }
      });
      
      return;
    }

    if (sub === 'catalog') {
      const filter = interaction.options.getString('filter');
      let badges = Object.values(profiles.badges);
      
      if (filter) {
        badges = badges.filter(b => b.type === filter);
      }
      
      if (!badges.length) {
        return interaction.editReply('📋 No hay insignias');
      }
      
      const byType = {};
      for (const badge of badges) {
        const t = badge.type || 'manual';
        if (!byType[t]) byType[t] = [];
        byType[t].push(badge);
      }
      
      const typeEmojis = {
        manual: '🎁',
        achievement: '🏆',
        shop: '🛒',
        custom: '✨'
      };

      // ✅ Dividir cada tipo en chunks de 15 badges
      const CHUNK_SIZE = 15;
      const pages = [];

      for (const [type, list] of Object.entries(byType)) {
        for (let i = 0; i < list.length; i += CHUNK_SIZE) {
          const chunk = list.slice(i, i + CHUNK_SIZE);
          const text = chunk.map(b => {
            const r = RARITIES[b.rarity] || RARITIES.common;
            return `${r.emoji} ${b.icon} **${b.name}**`;
          }).join('\n');

          const embed = new EmbedBuilder()
            .setColor(0x2196F3)
            .setTitle('🏆 Catálogo de Insignias')
            .addFields({
              name: `${typeEmojis[type] || '📌'} ${type.toUpperCase()}`,
              value: text,
              inline: false
            });

          pages.push(embed);
        }
      }

      let currentPage = 0;

      const updateFooter = () => {
        if (pages.length > 1) {
          pages[currentPage].setFooter({ text: `Página ${currentPage + 1}/${pages.length}` });
        }
      };

      const getButtons = () => {
        if (pages.length === 1) return [];
        return [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('catalog_prev')
              .setLabel('◀')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId('catalog_next')
              .setLabel('▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === pages.length - 1)
          )
        ];
      };

      updateFooter();
      const msg = await interaction.editReply({ 
        embeds: [pages[currentPage]], 
        components: getButtons() 
      });

      if (pages.length > 1) {
        const collector = msg.createMessageComponentCollector({ 
          componentType: ComponentType.Button, 
          time: 180_000 
        });

        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '❌ Solo tú puedes usar estos botones', ephemeral: true });
          }

          if (i.customId === 'catalog_prev' && currentPage > 0) currentPage--;
          if (i.customId === 'catalog_next' && currentPage < pages.length - 1) currentPage++;

          updateFooter();
          await i.update({ embeds: [pages[currentPage]], components: getButtons() });
        });

        collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });
      }

      return;
    }

    if (sub === 'progress') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      const { getUserBadges } = require('../../../utils/badgeManager');
      const levels = readLevels();
      
      const userProfile = ensureUser(profiles, interaction.guildId, targetUser.id);
      const userData = levels.guilds?.[interaction.guildId]?.[targetUser.id] || {};
      
      const allBadges = Object.values(profiles.badges || {}).filter(b => b.autoGrant);
      const earned = new Set(userProfile.earnedBadges || []);
      
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📊 Progreso de Logros - ${targetUser.username}`);
      
      for (const badge of allBadges) {
        const c = badge.autoGrant;
        const hasIt = earned.has(badge.id);
        
        let status = hasIt ? '✅ Desbloqueado' : '🔒 Bloqueado';
        let progress = '';
        
        if (!hasIt) {
          if (c.minLevel) {
            progress += `Nivel: ${userData.level || 0}/${c.minLevel}\n`;
          }
          if (c.minMessages) {
            progress += `Mensajes: ${userData.messages || 0}/${c.minMessages}\n`;
          }
          if (c.minVoiceMinutes) {
            const current = userData.voiceMs != null
              ? Math.floor(userData.voiceMs / 3600000)
              : Math.floor((userData.voiceMinutes || 0) / 60);
            const req = Math.floor(c.minVoiceMinutes / 60);
            progress += `Voz: ${current}h/${req}h\n`;
          }
        }
        
        embed.addFields({
          name: `${badge.icon || '🏅'} ${badge.name}`,
          value: `${status}\n${progress || badge.desc}`,
          inline: false
        });
      }
      
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'mine') {
      const { getUserBadges } = require('../../../utils/badgeManager');
      const { earned, equipped } = getUserBadges(interaction.guildId, interaction.user.id);

      if (!earned.length) {
        return interaction.editReply('📛 No tienes insignias');
      }

      const userProfile = ensureUser(profiles, interaction.guildId, interaction.user.id);
      const featuredId = userProfile.featuredBadge;
      const featuredBadge = featuredId ? profiles.badges?.[featuredId] : null;

      const equippedIds = new Set(equipped.map(b => b.id));
      const stacks = userProfile.badgeStacks || {};
      
      // ✅ Incluir ID entre paréntesis
      const listEquipped = equipped.map(b => {
        const count = stacks[b.id] > 1 ? ` (x${stacks[b.id]})` : '';
        return `${b.icon || '🏅'} **${b.name}**${count} \`(${b.id})\``;
      }).join('\n') || '—';
      
      const others = earned.filter(b => !equippedIds.has(b.id) && b.id !== featuredId);
      const CHUNK_SIZE = 15; // ✅ Reducido a 15 por el ID extra
      const chunks = [];
      for (let i = 0; i < others.length; i += CHUNK_SIZE) {
        chunks.push(others.slice(i, i + CHUNK_SIZE));
      }

      if (!chunks.length) {
        chunks.push([]);
      }

      let currentPage = 0;

      const buildEmbed = (pageIdx) => {
        const chunk = chunks[pageIdx] || [];
        const listOthers = chunk && chunk.length > 0
          ? chunk.map(b => {
              const icon = typeof b.icon === 'string' && b.icon.trim() ? b.icon : '🏅';
              const name = typeof b.name === 'string' && b.name.trim() ? b.name : 'Sin nombre';
              const id = typeof b.id === 'string' && b.id.trim() ? b.id : '???';
              const count = stacks[b.id] > 1 ? ` (x${stacks[b.id]})` : '';
              return `${icon} ${name}${count} \`(${id})\``;
            }).join('\n')
          : '—';

        const embed = new EmbedBuilder()
          .setColor(0xF6C343)
          .setTitle('🎖 Tus insignias');

        if (featuredBadge) {
          const featuredStack = stacks[featuredId] > 1 ? ` (x${stacks[featuredId]})` : '';
          const icon = typeof featuredBadge.icon === 'string' && featuredBadge.icon.trim() ? featuredBadge.icon : '🏅';
          const name = typeof featuredBadge.name === 'string' && featuredBadge.name.trim() ? featuredBadge.name : 'Sin nombre';
          const id = typeof featuredId === 'string' && featuredId.trim() ? featuredId : '???';
          embed.addFields({
            name: '✨ Insignia Destacada',
            value: `${icon} **${name}**${featuredStack} \`(${id})\``,
            inline: false
          });
        }

        // Validación estricta para evitar errores de Discord.js
        const safeListEquipped = typeof listEquipped === 'string' && listEquipped.trim() ? listEquipped : '—';
        const safeListOthers = typeof listOthers === 'string' && listOthers.trim() ? listOthers : '—';
        const safeDisponibles = `Disponibles (${typeof others.length === 'number' ? others.length : 0})`;

        // Dividir la lista de disponibles si es muy larga
        const fields = [
          { name: '✅ Equipadas', value: safeListEquipped, inline: false }
        ];
        if (safeListOthers.length <= 1024) {
          fields.push({ name: safeDisponibles, value: safeListOthers, inline: false });
        } else {
          // Fragmentar en campos de 1024 caracteres
          let idx = 0;
          let part = 1;
          const totalParts = Math.ceil(safeListOthers.length / 1024);
          while (idx < safeListOthers.length) {
            const chunk = safeListOthers.slice(idx, idx + 1024);
            fields.push({
              name: `${safeDisponibles} ${totalParts > 1 ? `${part}/${totalParts}` : ''}`.trim(),
              value: chunk,
              inline: false
            });
            idx += 1024;
            part++;
          }
        }
        try {
          embed.addFields(fields);
        } catch (err) {
          logger.error('[badge.js] Error en addFields:', {
            safeListEquipped,
            safeListOthers,
            safeDisponibles,
            others,
            listEquipped,
            listOthers,
            err
          });
          throw err;
        }

        if (chunks.length > 1) {
          embed.setFooter({ text: `Página ${pageIdx + 1}/${chunks.length} • Usa el ID para equipar/destacar` });
        } else {
          embed.setFooter({ text: 'Usa el ID para equipar/destacar badges' });
        }

        return embed;
      };

      const getButtons = () => {
        if (chunks.length === 1) return [];
        return [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('badge_mine_prev')
              .setLabel('◀')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId('badge_mine_next')
              .setLabel('▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === chunks.length - 1)
          )
        ];
      };

      const msg = await interaction.editReply({ 
        embeds: [buildEmbed(currentPage)], 
        components: getButtons() 
      });

      if (chunks.length > 1) {
        const collector = msg.createMessageComponentCollector({ 
          componentType: ComponentType.Button, 
          time: 180_000 
        });

        collector.on('collect', async i => {
          if (i.user.id !== interaction.user.id) {
            return i.reply({ content: '❌ Solo tú puedes usar estos botones', ephemeral: true });
          }

          if (i.customId === 'badge_mine_prev' && currentPage > 0) currentPage--;
          if (i.customId === 'badge_mine_next' && currentPage < chunks.length - 1) currentPage++;

          await i.update({ embeds: [buildEmbed(currentPage)], components: getButtons() });
        });

        collector.on('end', () => {
          interaction.editReply({ components: [] }).catch(() => {});
        });
      }

      return;
    }

    if (sub === 'check') {
      const targetUser = interaction.options.getUser('user') || interaction.user;
      
      if (targetUser.id !== interaction.user.id &&
          !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.editReply('❌ Solo admins pueden verificar otros usuarios');
      }
      
      const { checkAndGrantBadges } = require('../../../utils/badgeManager');
      const newBadges = await checkAndGrantBadges(interaction.guild, targetUser.id);

      if (!newBadges.length) {
        return interaction.editReply('ℹ️ No hay nuevos logros disponibles.');
      }

      const list = newBadges.map(b => `${b.icon || '🏅'} **${b.name}**`).join('\n');
      return interaction.editReply(`✅ Nuevos logros:\n${list}`);
    }
  }
};