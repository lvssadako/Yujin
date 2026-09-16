const logger = require('../../utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { writeConfig } = require('../../utils/configCache');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setboostchannel')
    .setDescription('Configura o remueve el canal para notificaciones de boosts')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Configura el canal de notificaciones')
      .addChannelOption(option => 
        option.setName('canal')
          .setDescription('Canal donde se enviarán las notificaciones')
          .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remueve el canal de notificaciones')),

  async execute(interaction) {
    try {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'set') {
        const channel = interaction.options.getChannel('canal');
        writeConfig(current => ({ ...current, boostChannelId: channel.id }));
        await interaction.reply(`✅ Canal de notificaciones de boost configurado a ${channel}`);
      } 
      else if (subcommand === 'remove') {
        writeConfig(current => {
          const next = { ...current };
          delete next.boostChannelId;
          return next;
        });
        await interaction.reply('✅ Canal de notificaciones de boost removido');
      }
    } catch (err) {
      logger.error('Error en setboostchannel:', err);
      await interaction.reply({ 
        content: '❌ Ocurrió un error al configurar el canal', 
        ephemeral: true 
      });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild) && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos para gestionar canales de boost.');
    }
    const sub = (args[0] || '').toLowerCase();
    try {
      if (sub === 'remove' || sub === 'quitar') {
        writeConfig(current => {
          const next = { ...current };
          delete next.boostChannelId;
          return next;
        });
        return message.reply('✅ Canal de notificaciones de boost removido.');
      }
      const channel = message.mentions.channels.first() || (args[1] ? await message.guild.channels.fetch(args[1]).catch(() => null) : null);
      if (!channel) return message.reply('❌ Uso: `&setboostchannel set #canal` o `&setboostchannel remove`');
      writeConfig(current => ({ ...current, boostChannelId: channel.id }));
      return message.reply(`✅ Canal de notificaciones de boost configurado a <#${channel.id}>.`);
    } catch (err) {
      logger.error('Error en setboostchannel prefix:', err);
      message.reply('❌ Ocurrió un error al configurar el canal.');
    }
  }
};
