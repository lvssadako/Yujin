const logger = require('../../utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const cfgPath = path.join(__dirname, '..', '..', '..', 'config.json');

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
      const config = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'set') {
        const channel = interaction.options.getChannel('canal');
        config.boostChannelId = channel.id;
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
        await interaction.reply(`✅ Canal de notificaciones de boost configurado a ${channel}`);
      } 
      else if (subcommand === 'remove') {
        delete config.boostChannelId;
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
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
      const config = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
      if (sub === 'remove' || sub === 'quitar') {
        delete config.boostChannelId;
        fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
        return message.reply('✅ Canal de notificaciones de boost removido.');
      }
      const channel = message.mentions.channels.first() || (args[1] ? await message.guild.channels.fetch(args[1]).catch(() => null) : null);
      if (!channel) return message.reply('❌ Uso: `&setboostchannel set #canal` o `&setboostchannel remove`');
      config.boostChannelId = channel.id;
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));
      return message.reply(`✅ Canal de notificaciones de boost configurado a <#${channel.id}>.`);
    } catch (err) {
      logger.error('Error en setboostchannel prefix:', err);
      message.reply('❌ Ocurrió un error al configurar el canal.');
    }
  }
};