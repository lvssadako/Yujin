// ...existing code...
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

// ...existing code...
module.exports = (client) => {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      const configPath = path.join(__dirname, '..', 'config.json');
      const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

      // --- VIP role auto-removal ---
      if (cfg.vipRoleId && cfg.colors) {
        const hadVip = oldMember.roles.cache.has(cfg.vipRoleId);
        const hasVip = newMember.roles.cache.has(cfg.vipRoleId);

        if (hadVip && !hasVip) {
          const colorIds = Object.values(cfg.colors).map(c => c.roleId).filter(Boolean);
          if (colorIds.length > 0) {
            await newMember.roles.remove(colorIds).catch(() => {});
            console.log(`Removed color roles from ${newMember.user.tag} after losing VIP.`);
          }
        }
      }

    // --- Boost detection/logging ---
      const hadBoost = Boolean(oldMember.premiumSince);
      const hasBoost = Boolean(newMember.premiumSince);

      if (hadBoost !== hasBoost) {
        // Preferimos canales específicos (añadido/removido), si no existe usamos boostChannelId como fallback
        const addedId = cfg.boostAddedChannelId || cfg.boostChannelId;
        const removedId = cfg.boostRemovedChannelId || cfg.boostChannelId;

        // Determinar cuál id usar según el evento
        const targetId = (!hadBoost && hasBoost) ? addedId : (hadBoost && !hasBoost) ? removedId : null;
        if (!targetId) {
          console.warn('[guildMemberUpdate] No hay canal de log de boost configurado en config.json');
          return;
        }

        // Intentar obtener canal desde cache, si no fetch
        let logChannel = newMember.guild.channels.cache.get(targetId);
        if (!logChannel) {
          logChannel = await newMember.guild.channels.fetch(targetId).catch(() => null);
        }
        if (!logChannel) {
          console.warn(`[guildMemberUpdate] Canal de log de boost no encontrado: ${targetId}`);
          return;
        }

        // Pequeña espera para que el contador de boosts se actualice
        await new Promise(res => setTimeout(res, 2000));
        const oldBoosts = oldMember.guild.premiumSubscriptionCount || 0;
        const newBoosts = newMember.guild.premiumSubscriptionCount || 0;

        const embed = new EmbedBuilder()
          .setTimestamp()
          .setFooter({ text: `Servidor: ${newMember.guild.name}` })
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }));

        if (!hadBoost && hasBoost) {
          embed
            .setColor(0xff73fa)
            .setTitle('💎 ¡Nuevo Booster!')
            .setDescription(`**${newMember.user.tag}** comenzó a boostear el servidor ✨`)
            .addFields(
              { name: '🆕 Boost actual', value: `${newBoosts}`, inline: true },
              { name: '📈 Incremento', value: `+${Math.max(0, newBoosts - oldBoosts)}`, inline: true }
            );
        } else if (hadBoost && !hasBoost) {
          embed
            .setColor(0xfc3c3c)
            .setTitle('💔 Booster perdido')
            .setDescription(`**${newMember.user.tag}** dejó de boostear el servidor 😢`)
            .addFields(
              { name: '💎 Boost actual', value: `${newBoosts}`, inline: true },
              { name: '📉 Disminución', value: `${Math.max(0, oldBoosts - newBoosts)}`, inline: true }
            );
        }

        await logChannel.send({ embeds: [embed] }).catch(err => {
          console.error('Error enviando log de boost:', err);
        });
      }

    } catch (err) {
      console.error('guildMemberUpdate handler error:', err);
    }
  });
};