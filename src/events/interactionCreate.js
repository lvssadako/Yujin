const logger = require('../utils/logger');
const { Events } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = (client) => {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        logger.info(`🔹 Slash usado: ${interaction.commandName} por ${interaction.user.tag}`);
        const cmd = client.commands.get(interaction.commandName);
        if (!cmd) {
          logger.info('⚠️ Comando no encontrado en colección.');
          return interaction.reply({ content: 'Comando no encontrado', flags: 64 });
        }
        logger.info('✅ Ejecutando comando slash...');
        await cmd.execute(interaction, client);
        logger.info('✅ Comando ejecutado con éxito.');
        return;
      }

      if (interaction.customId?.startsWith('profile_')) {
        const { handleProfileInteraction } = require('../services/profile/profileCustomizer');
        await handleProfileInteraction(interaction);
        return;
      }

      if (interaction.customId?.startsWith('streak_')) {
        const { handleStreakCustomizerInteraction } = require('../services/streak/streakCustomizer');
        await handleStreakCustomizerInteraction(interaction);
        return;
      }

      // BOTONES
      if (interaction.isButton()) {
                // Botón de compra de boost XP en /shop
                if (interaction.customId.startsWith('shop_buy_')) {
                  const shop = require('../commands/economy/shop.js');
                  await shop.handleButton(interaction);
                  return;
                }
        // --- Blackjack vs Bot Buttons (legacy, delegated to unified handler) ---
        if (interaction.customId === 'blackjackbot_hit' || interaction.customId === 'blackjackbot_stand') {
          const blackjackCmd = require('../commands/games/blackjack.js');
          await blackjackCmd.handleButton(interaction);
          return;
        }
        // Botón de abrir otros X cofres
        if (interaction.customId.startsWith('chest_open_more_')) {
          const cantidad = parseInt(interaction.customId.split('_').pop(), 10);
          const { handleChestOpen } = require('../commands/economy/chest.js');
          await handleChestOpen(interaction, cantidad, true);
          return;
        }
        // Botón de compra (abre modal)
        if (interaction.customId === 'chest_buy') {
          const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
          const modal = new ModalBuilder()
            .setCustomId('chest_buy_modal')
            .setTitle('Comprar cofres');
          const input = new TextInputBuilder()
  .setCustomId('chest_buy_amount')
  .setLabel('¿Cuántos cofres? (1000🪙 c/u)') // <--- menos de 45 caracteres
  .setStyle(TextInputStyle.Short)
  .setPlaceholder('Ejemplo: 5')
  .setRequired(true);
          modal.addComponents(new ActionRowBuilder().addComponents(input));
          await interaction.showModal(modal);
          return;
        }
        // Botón cerrar
        if (interaction.customId === 'chest_close') {
          await interaction.update({ content: 'Cofre cerrado.', embeds: [], components: [] });
          return;
        }
        // Botón de prueba (opcional)
        if (interaction.customId === 'test_btn') {
          await interaction.update({ content: '¡Botón pulsado!', components: [] });
          return;
        }

        // --- Blackjack PvP Buttons ---
        if (interaction.customId === 'blackjack_hit' || interaction.customId === 'blackjack_stand') {
          // Delegar a handler modular de blackjack
          const blackjackCmd = require('../commands/games/blackjack.js');
          await blackjackCmd.handleButton(interaction);
          return;
        }
      }

      // Modal de compra de cofres
      if (interaction.isModalSubmit() && interaction.customId === 'chest_buy_modal') {
        const amount = parseInt(interaction.fields.getTextInputValue('chest_buy_amount'), 10);
        if (isNaN(amount) || amount < 1 || amount > 20) {
          return interaction.reply({ content: 'Cantidad inválida. Debe ser entre 1 y 20.', ephemeral: true });
        }
        const { handleChestBuy } = require('../commands/economy/chest.js');
        await handleChestBuy(interaction, amount);
        return;
      }

      // Select menus
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'booster_select') {
          const boosters = require('../commands/boost/boosters.js');
          await boosters.handleSelect(interaction);
          return;
        }
        if (interaction.customId === 'lco_color_menu') {
          await interaction.deferReply({ flags: 64 });
          const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
          const vipRoleId = cfg.vipRoleId;
          if (!vipRoleId) return interaction.editReply({ content: '❌ No hay rol requerido configurado.' });

          const member = interaction.member;
          const guild = interaction.guild;
          const vipRole = guild.roles.cache.get(vipRoleId);
          if (!vipRole || !member.roles.cache.has(vipRoleId)) {
            const mention = vipRole ? `<@&${vipRoleId}>` : 'el rol requerido';
            return interaction.editReply({ content: `❌ Necesitas el rol ${mention} para usar este menú.` });
          }

          const val = interaction.values[0];
          const colorEntries = Object.entries(cfg.colors || {});
          const colorRoleIds = colorEntries.map(([k, v]) => v.roleId);
          try {
            await member.roles.remove(colorRoleIds.filter(Boolean)).catch(() => {});
          } catch (err) { logger.error('Error removiendo roles previos:', err); }

          if (val === 'remove_color') {
            return interaction.editReply({ content: '🎨 Has quitado tu color.' });
          }

          const item = cfg.colors && cfg.colors[val];
          if (!item) return interaction.editReply({ content: '⚠️ Opción inválida.' });

          try {
            await member.roles.add(item.roleId);
            return interaction.editReply({ content: `✅ Tu color fue cambiado a **${item.name}**.` });
          } catch (err) {
            logger.error('Error asignando rol:', err);
            return interaction.editReply({ content: '⚠️ Error al asignar el rol (missing perms o posición de roles).' });
          }
        }
      }

      // Botón de retroceder en boosters
      if (interaction.isButton() && interaction.customId === 'booster_back') {
        const boosters = require('../commands/boost/boosters.js');
        await boosters.handleBack(interaction);
        return;
      }
    } catch (err) {
      logger.error('Error InteractionCreate:', err);
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content: '❌ Error interno.' });
        else await interaction.reply({ content: '❌ Error interno.', flags: 64 });
      } catch {}
    }
  });
};