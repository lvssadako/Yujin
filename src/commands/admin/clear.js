const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra una cantidad específica de mensajes en el canal.')
    .addIntegerOption(option => option.setName('cantidad').setDescription('Número de mensajes a borrar (1-100)').setRequired(true))
    .addUserOption(option => option.setName('usuario').setDescription('Borrar solo mensajes de este usuario').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const amount = interaction.options.getInteger('cantidad');
    const targetUser = interaction.options.getUser('usuario');

    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: '❌ Debes ingresar un número entre 1 y 100.', ephemeral: true });
    }

    try {
      const messages = await interaction.channel.messages.fetch({ limit: amount });
      let messagesToDelete = messages;

      if (targetUser) {
        messagesToDelete = messages.filter(m => m.author.id === targetUser.id);
      }

      const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);
      
      logger.info('Clear ejecutado', { channel: interaction.channel.name, amount: deleted.size, user: targetUser ? targetUser.tag : 'todos' });
      
      await interaction.reply({ content: `✅ Se han borrado **${deleted.size}** mensajes${targetUser ? ` de **${targetUser.tag}**` : ''}.`, ephemeral: true });
    } catch (error) {
      logger.error('Error en clear', { error: error.message });
      await interaction.reply({ content: '❌ Hubo un error al borrar mensajes. Asegúrate de que no tengan más de 14 días de antigüedad.', ephemeral: true });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply('❌ No tienes permisos para gestionar mensajes.');
    }
    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ Uso: `&clear <cantidad 1-100> [@usuario]`');
    }
    const targetUser = message.mentions.users.first() || null;
    try {
      const fetchLimit = targetUser ? Math.min(amount + 10, 100) : Math.min(amount + 1, 100);
      const messages = await message.channel.messages.fetch({ limit: fetchLimit });
      let messagesToDelete = messages.filter(m => m.id !== message.id);
      if (targetUser) {
        messagesToDelete = messagesToDelete.filter(m => m.author.id === targetUser.id);
      }
      const toDeleteArray = Array.from(messagesToDelete.values()).slice(0, amount);
      const deleted = await message.channel.bulkDelete(toDeleteArray, true);
      const reply = await message.channel.send(`✅ Se han borrado **${deleted.size}** mensajes${targetUser ? ` de **${targetUser.tag}**` : ''}.`);
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
      logger.error('Error en clear prefix', { error: error.message });
      message.reply('❌ Hubo un error al borrar mensajes. Asegúrate de que no tengan más de 14 días de antigüedad.').catch(() => {});
    }
  }
};
