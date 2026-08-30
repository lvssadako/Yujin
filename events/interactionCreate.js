const logger = require('../src/utils/logger');
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

      // BOTONES
      if (interaction.isButton()) {
                // Botón de compra de boost XP en /shop
                if (interaction.customId.startsWith('shop_buy_')) {
                  const shop = require('../commands/shop.js');
                  await shop.handleButton(interaction);
                  return;
                }
        // --- Blackjack vs Bot Buttons ---
        if (interaction.customId === 'blackjackbot_hit' || interaction.customId === 'blackjackbot_stand') {
          const partidas = global.gambleBlackjackBot = global.gambleBlackjackBot || {};
          const partida = partidas[interaction.user.id];
          if (!partida || partida.estado !== 'jugando') {
            return interaction.reply({ content: '❌ No tienes una partida activa de blackjack vs bot.', ephemeral: true });
          }
          const { blackjack } = require('../commands/gamble.js');
          // Prevención de doble click
          if (partida.accionEnCurso) {
            return interaction.reply({ content: '⏳ Espera a que se procese tu jugada anterior.', ephemeral: true });
          }
          partida.accionEnCurso = true;
          // Timeout de turno
          if (partida.turnTimeout) clearTimeout(partida.turnTimeout);
          partida.turnTimeout = setTimeout(async () => {
            const { addCoins, readProfiles, writeProfiles, ensureUser } = require('../utils/economy');
            const profiles = require('../utils/profileStore').readProfiles();
            const u = require('../utils/profileStore').ensureUser(profiles, partida.guildId, partida.userId);
            addCoins(partida.guildId, partida.userId, partida.apuesta);
            require('../utils/profileStore').writeProfiles(profiles);
            await interaction.followUp({ content: null, embeds: [{ title: '♠️ Blackjack vs Bot - Timeout', description: '⏰ Tiempo agotado. Recuperas tu apuesta.', color: 0xdd2e44 }], components: [], ephemeral: false });
            delete partidas[interaction.user.id];
          }, 30000);
          // Acción del jugador
          if (interaction.customId === 'blackjackbot_hit') {
            partida.manoJugador.push(blackjack.carta());
            if (blackjack.valor(partida.manoJugador) > 21) {
              partida.terminado = true;
            }
          } else if (interaction.customId === 'blackjackbot_stand') {
            // Turno del bot
            while (blackjack.valor(partida.manoBot) < 17) {
              partida.manoBot.push(blackjack.carta());
            }
            partida.terminado = true;
          }
          partida.accionEnCurso = false;
          await blackjack.mostrarTurnoBot(interaction, partida);
          return;
        }
        // Botón de abrir otros X cofres
        if (interaction.customId.startsWith('chest_open_more_')) {
          const cantidad = parseInt(interaction.customId.split('_').pop(), 10);
          const { handleChestOpen } = require('../commands/chest.js');
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
        const { handleChestBuy } = require('../commands/chest.js');
        await handleChestBuy(interaction, amount);
        return;
      }

      // Select menus
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'booster_select') {
          const boosters = require('../commands/boosters.js');
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
        const boosters = require('../commands/boosters.js');
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