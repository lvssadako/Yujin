const logger = require('../src/utils/logger');
const { Events } = require('discord.js');
const { handleChestOpen } = require('../commands/chest.js');

module.exports = (client) => {
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    try {
      if (interaction.customId === 'chest_open_more') {
        await handleChestOpen(interaction, 1, true);
      } else if (interaction.customId === 'chest_buy') {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({ content: 'Usa `/chest buy <cantidad>` para comprar más cofres.' });
        }
      } else if (interaction.customId === 'chest_close') {
        await interaction.update({ content: 'Cofre cerrado.', embeds: [], components: [] });
      }
    } catch (err) {
      if (err.code !== 40060) {
        logger.error('Error en interacción de botón:', err);
      }
      if (!interaction.deferred && !interaction.replied) {
        try { await interaction.deferUpdate(); } catch {}
      }
    }
  });
};