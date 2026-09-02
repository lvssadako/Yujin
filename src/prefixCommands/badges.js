const logger = require('../utils/logger');
const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  ButtonStyle, 
  ComponentType, 
  PermissionFlagsBits 
} = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
const { readLevels } = require('../services/level').levelService;
const { readShop, writeShop, rotateShop, ensureRotation } = require('../utils/badgeShop');
const { getBalance, removeCoins } = require('../services/economy/index').economyService;
const { readConfig } = require('../utils/configCache');

const RARITIES = {
  common: { emoji: '⚪', color: 0x9E9E9E, name: 'Común' },
  rare: { emoji: '🔵', color: 0x2196F3, name: 'Rara' },
  epic: { emoji: '🟣', color: 0x9C27B0, name: 'Épica' },
  legendary: { emoji: '🟡', color: 0xFFD700, name: 'Legendaria' }
};

function resolveTargetUser(message, arg) {
  if (!arg) return message.author;
  const mention = arg.match(/^<@!?(\d+)>$/);
  if (mention) {
    return message.client.users.cache.get(mention[1]) || null;
  }
  if (/^\d{17,19}$/.test(arg)) {
    return message.client.users.cache.get(arg) || null;
  }
  return null;
}

module.exports = {
  name: 'badges',
  description: 'Sistema completo de insignias con prefijo',
  aliases: ['badge', 'insignias', 'insignia'],

  async execute(message, args, client) {
    const sub = (args[0] || 'mine').toLowerCase();
    const profiles = readProfiles();
    profiles.badges ||= {};

    const guildId = message.guild?.id;
    if (!guildId) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }

    // 1. VER MIS INSIGNIAS (mine / por defecto)
    if (sub === 'mine' || sub === 'mis' || (!args[0] && sub === 'mine')) {
      const user = ensureUser(profiles, guildId, message.author.id);
      const earned = user.earnedBadges || [];

      if (earned.length === 0) {
        return message.reply('ℹ️ **No tienes insignias todavía.** Desbloquea logros chateando o visita `&badges shop` para comprar en la tienda.');
      }

      const allBadges = profiles.badges || {};
      const uniqueEarned = [...new Set(earned)];
      const itemsPerPage = 8;
      const chunks = [];

      for (let i = 0; i < uniqueEarned.length; i += itemsPerPage) {
        chunks.push(uniqueEarned.slice(i, i + itemsPerPage));
      }

      let currentPage = 0;

      const buildEmbed = (page) => {
        const chunk = chunks[page] || [];
        const lines = chunk.map((id, index) => {
          const b = allBadges[id] || { name: id, icon: '🏅', rarity: 'common' };
          const rarityInfo = RARITIES[b.rarity] || RARITIES.common;
          const isEquipped = (user.equippedBadges || []).includes(id);
          const isFeatured = user.featuredBadge === id;

          let statusTag = '';
          if (isFeatured) statusTag = ' ⭐ `DESTACADA`';
          else if (isEquipped) statusTag = ' 🛡️ `EQUIPADA`';

          return `\`${page * itemsPerPage + index + 1}.\` ${b.icon || '🏅'} **${b.name}** [ID: \`${id}\`] • ${rarityInfo.emoji} *${rarityInfo.name}*${statusTag}`;
        }).join('\n');

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setAuthor({ name: `Insignias de ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
          .setTitle(`🏅 Tus Insignias Desbloqueadas (${earned.length} en total)`)
          .setDescription(lines || '*Sin insignias en esta página.*')
          .setFooter({ text: `Página ${page + 1} de ${chunks.length} • Usa &badges equip <id> o &badges feature <id>` })
          .setTimestamp();

        return embed;
      };

      const getButtons = () => {
        if (chunks.length <= 1) return [];
        return [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('badge_prefix_prev')
              .setLabel('◀ Anterior')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === 0),
            new ButtonBuilder()
              .setCustomId('badge_prefix_next')
              .setLabel('Siguiente ▶')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(currentPage === chunks.length - 1)
          )
        ];
      };

      const replyMsg = await message.reply({
        embeds: [buildEmbed(currentPage)],
        components: getButtons()
      });

      if (chunks.length > 1) {
        const collector = replyMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 120_000
        });

        collector.on('collect', async i => {
          if (i.user.id !== message.author.id) {
            return i.reply({ content: '❌ Solo tú puedes usar estos botones.', ephemeral: true });
          }

          if (i.customId === 'badge_prefix_prev' && currentPage > 0) currentPage--;
          if (i.customId === 'badge_prefix_next' && currentPage < chunks.length - 1) currentPage++;

          await i.update({ embeds: [buildEmbed(currentPage)], components: getButtons() });
        });

        collector.on('end', () => {
          replyMsg.edit({ components: [] }).catch(() => {});
        });
      }

      return;
    }

    // 2. TIENDA DE INSIGNIAS (shop / tienda)
    if (sub === 'shop' || sub === 'tienda') {
      ensureRotation(profiles);
      const shop = readShop();
      const allBadges = profiles.badges || {};

      if (!shop.rotation || shop.rotation.length === 0) {
        return message.reply('🛒 **La tienda de insignias está vacía en este momento.**');
      }

      const list = shop.rotation.map((item, i) => {
        const b = allBadges[item.id] || { name: item.id, icon: '🏅', desc: '' };
        const price = item.price || b.price || 500;
        return `\`${i + 1}.\` ${b.icon || '🏅'} **${b.name}** — 🪙 \`${price.toLocaleString()} monedas\`\n> *${b.desc || 'Insignia exclusiva de la tienda'}*\n> Comando para comprar: \`&badges buy ${item.id}\``;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('🛒 Tienda Diaria de Insignias')
        .setDescription(`¡Compra insignias exclusivas para tu perfil!\n\n${list}`)
        .setFooter({ text: 'Rotación automática diaria • Usa &badges buy <id>' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 3. COMPRAR INSIGNIA (buy / comprar)
    if (sub === 'buy' || sub === 'comprar') {
      const badgeId = args[1];
      if (!badgeId) {
        return message.reply('❌ **Debes especificar la ID de la insignia.**\nEjemplo: `&badges buy gold_star`');
      }

      ensureRotation(profiles);
      const shop = readShop();
      const allBadges = profiles.badges || {};
      const shopItem = (shop.rotation || []).find(item => item.id.toLowerCase() === badgeId.toLowerCase());

      if (!shopItem) {
        return message.reply(`❌ La insignia \`${badgeId}\` no está disponible actualmente en la tienda.`);
      }

      const user = ensureUser(profiles, guildId, message.author.id);
      if ((user.earnedBadges || []).includes(shopItem.id)) {
        return message.reply('⚠️ **Ya posees esta insignia.**');
      }

      const price = shopItem.price || (allBadges[shopItem.id]?.price) || 500;
      const userBalance = await getBalance(guildId, message.author.id);

      if (userBalance < price) {
        return message.reply(`❌ No tienes suficientes monedas. Cuesta **${price.toLocaleString()}🪙** y tienes **${userBalance.toLocaleString()}🪙**.`);
      }

      await removeCoins(guildId, message.author.id, price, 'Compra de insignia');
      user.earnedBadges = user.earnedBadges || [];
      user.earnedBadges.push(shopItem.id);
      writeProfiles(profiles);

      const b = allBadges[shopItem.id] || { name: shopItem.id, icon: '🏅' };
      return message.reply(`🎉 **¡Compra exitosa!** Has adquirido la insignia ${b.icon || '🏅'} **${b.name}** por **${price.toLocaleString()}🪙**.\nUsa \`&badges equip ${shopItem.id}\` para lucirla en tu perfil.`);
    }

    // 4. EQUIPAR INSIGNIA (equip)
    if (sub === 'equip' || sub === 'equipar') {
      const badgeId = args[1];
      if (!badgeId) {
        return message.reply('❌ **Debes especificar la ID de la insignia a equipar.**\nEjemplo: `&badges equip mi_badge`');
      }

      const user = ensureUser(profiles, guildId, message.author.id);
      const earned = user.earnedBadges || [];

      if (!earned.includes(badgeId)) {
        return message.reply(`❌ No posees la insignia con ID \`${badgeId}\`.`);
      }

      user.equippedBadges = user.equippedBadges || [];
      if (user.equippedBadges.includes(badgeId)) {
        return message.reply('⚠️ Ya tienes equipada esta insignia.');
      }

      if (user.equippedBadges.length >= 6) {
        return message.reply('⚠️ Solo puedes tener hasta **6 insignias equipadas**. Usa `&badges unequip <id>` para liberar un espacio.');
      }

      user.equippedBadges.push(badgeId);
      writeProfiles(profiles);

      const b = (profiles.badges || {})[badgeId] || { name: badgeId, icon: '🏅' };
      return message.reply(`✅ Has equipado la insignia ${b.icon || '🏅'} **${b.name}** en tu perfil.`);
    }

    // 5. DESEQUIPAR INSIGNIA (unequip)
    if (sub === 'unequip' || sub === 'desequipar') {
      const badgeId = args[1];
      if (!badgeId) {
        return message.reply('❌ **Debes especificar la ID de la insignia a desequipar.**\nEjemplo: `&badges unequip mi_badge`');
      }

      const user = ensureUser(profiles, guildId, message.author.id);
      user.equippedBadges = user.equippedBadges || [];

      if (!user.equippedBadges.includes(badgeId)) {
        return message.reply(`⚠️ No tienes equipada la insignia \`${badgeId}\`.`);
      }

      user.equippedBadges = user.equippedBadges.filter(id => id !== badgeId);
      writeProfiles(profiles);

      return message.reply(`✅ Has desequipado la insignia \`${badgeId}\` de tu perfil.`);
    }

    // 6. DESTACAR INSIGNIA (feature)
    if (sub === 'feature' || sub === 'destacar') {
      const badgeId = args[1];
      if (!badgeId) {
        return message.reply('❌ **Debes especificar la ID de la insignia a destacar.**\nEjemplo: `&badges feature mi_badge`');
      }

      const user = ensureUser(profiles, guildId, message.author.id);
      if (!(user.earnedBadges || []).includes(badgeId)) {
        return message.reply(`❌ No posees la insignia \`${badgeId}\`.`);
      }

      user.featuredBadge = badgeId;
      writeProfiles(profiles);

      const b = (profiles.badges || {})[badgeId] || { name: badgeId, icon: '⭐' };
      return message.reply(`⭐ Has configurado ${b.icon || '⭐'} **${b.name}** como tu **insignia destacada** principal.`);
    }

    // 7. QUITAR DESTACADA (unfeature)
    if (sub === 'unfeature' || sub === 'quitar_destacada') {
      const user = ensureUser(profiles, guildId, message.author.id);
      user.featuredBadge = null;
      writeProfiles(profiles);
      return message.reply('✅ Se ha removido tu insignia destacada.');
    }

    // 8. CATÁLOGO COMPLETO (catalog / catalogo)
    if (sub === 'catalog' || sub === 'catalogo') {
      const allBadges = Object.values(profiles.badges || {});
      if (allBadges.length === 0) {
        return message.reply('ℹ️ No hay insignias registradas en el catálogo.');
      }

      const list = allBadges.slice(0, 15).map(b => {
        const rarityInfo = RARITIES[b.rarity] || RARITIES.common;
        return `${b.icon || '🏅'} **${b.name}** [ID: \`${b.id}\`] • ${rarityInfo.emoji} ${rarityInfo.name}\n> *${b.desc || 'Sin descripción'}*`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📚 Catálogo de Insignias')
        .setDescription(list)
        .setFooter({ text: `Mostrando ${Math.min(15, allBadges.length)} de ${allBadges.length} insignias` })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // 9. VERIFICAR LOGROS (check)
    if (sub === 'check' || sub === 'verificar') {
      const { checkAndGrantBadges } = require('../utils/badgeManager');
      const newBadges = await checkAndGrantBadges(message.guild, message.author.id);

      if (!newBadges || newBadges.length === 0) {
        return message.reply('ℹ️ No tienes nuevos logros desbloqueables en este momento.');
      }

      const list = newBadges.map(b => `${b.icon || '🏅'} **${b.name}**`).join('\n');
      return message.reply(`🎉 **¡Felicidades! Has desbloqueado nuevos logros:**\n${list}`);
    }

    // 10. ADMINISTRACIÓN: OTORGAR INSIGNIA (give)
    if (sub === 'give' || sub === 'dar') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply('🚫 Necesitas permisos de Administrador o Gestionar Servidor.');
      }

      const targetUser = resolveTargetUser(message, args[1]);
      const badgeId = args[2];

      if (!targetUser || !badgeId) {
        return message.reply('❌ **Uso correcto:** `&badges give @usuario <id_insignia>`');
      }

      const allBadges = profiles.badges || {};
      if (!allBadges[badgeId]) {
        return message.reply(`❌ No existe ninguna insignia con la ID \`${badgeId}\`.`);
      }

      const user = ensureUser(profiles, guildId, targetUser.id);
      user.earnedBadges = user.earnedBadges || [];
      if (user.earnedBadges.includes(badgeId)) {
        return message.reply(`⚠️ **${targetUser.username}** ya posee esa insignia.`);
      }

      user.earnedBadges.push(badgeId);
      writeProfiles(profiles);

      const b = allBadges[badgeId];
      return message.reply(`🎁 ¡Has otorgado la insignia ${b.icon || '🏅'} **${b.name}** a **${targetUser.username}**!`);
    }

    // 11. ADMINISTRACIÓN: REVOCAR INSIGNIA (revoke)
    if (sub === 'revoke' || sub === 'quitar') {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return message.reply('🚫 Necesitas permisos de Administrador o Gestionar Servidor.');
      }

      const targetUser = resolveTargetUser(message, args[1]);
      const badgeId = args[2];

      if (!targetUser || !badgeId) {
        return message.reply('❌ **Uso correcto:** `&badges revoke @usuario <id_insignia>`');
      }

      const user = ensureUser(profiles, guildId, targetUser.id);
      user.earnedBadges = user.earnedBadges || [];

      if (!user.earnedBadges.includes(badgeId)) {
        return message.reply(`⚠️ **${targetUser.username}** no tiene esa insignia.`);
      }

      user.earnedBadges = user.earnedBadges.filter(id => id !== badgeId);
      user.equippedBadges = (user.equippedBadges || []).filter(id => id !== badgeId);
      if (user.featuredBadge === badgeId) user.featuredBadge = null;
      writeProfiles(profiles);

      return message.reply(`🗑️ Has revocado la insignia \`${badgeId}\` a **${targetUser.username}**.`);
    }

    // AYUDA / COMANDO NO RECONOCIDO
    return message.reply(
      '📖 **Comandos de Insignias con Prefijo:**\n' +
      '• `&badges mine` — Ver tus insignias desbloqueadas y equipadas\n' +
      '• `&badges shop` — Ver la tienda diaria de insignias\n' +
      '• `&badges buy <id>` — Comprar una insignia de la tienda\n' +
      '• `&badges equip <id>` — Equipar una insignia en tu perfil\n' +
      '• `&badges unequip <id>` — Desequipar una insignia\n' +
      '• `&badges feature <id>` — Destacar una insignia principal\n' +
      '• `&badges catalog` — Explorar el catálogo completo\n' +
      '• `&badges check` — Verificar y reclamar logros automáticos\n' +
      '• `&badges give @user <id>` — *(Admin)* Otorgar una insignia\n' +
      '• `&badges revoke @user <id>` — *(Admin)* Quitar una insignia'
    );
  }
};
