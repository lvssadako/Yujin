const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} = require('discord.js');
const { readConfig, writeConfig } = require('../../utils/configCache');
const logger = require('../../utils/logger');

function buildStatusEmbed(guild, channelId) {
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  const embed = new EmbedBuilder()
    .setTitle('📢 Canal de Notificaciones de Nivel (Level-Up)')
    .setColor(channel ? 0x5865F2 : 0x95A5A6)
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
      {
        name: 'Estado de Notificaciones',
        value: channel 
          ? `✅ **Canal Configurado:** <#${channel.id}> (\`${channel.id}\`)`
          : '⚠️ **Sin canal fijo:** Los anuncios de subida de nivel se enviarán en el mismo canal donde el usuario interactúe.',
        inline: false
      },
      {
        name: 'Comandos de Configuración',
        value: '• `/setlevelchannel set canal:#canal` o `&setlevelchannel set #canal`\n• `/setlevelchannel remove` o `&setlevelchannel remove`\n• `/setlevelchannel status` o `&setlevelchannel status`',
        inline: false
      }
    )
    .setFooter({ text: `Servidor: ${guild.name}` })
    .setTimestamp();

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlevelchannel')
    .setDescription('Configura o remueve el canal para los anuncios de subida de nivel (level-up)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Establece el canal donde se anunciarán las subidas de nivel')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal de texto donde se enviarán las notificaciones de level-up')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Elimina el canal de notificaciones (los avisos volverán al canal donde chatee el usuario)')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Muestra el canal de notificaciones de nivel actualmente configurado')
    ),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Este comando solo puede usarse en un servidor.', ephemeral: true });
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Necesitas permisos de **Administrar Servidor** para configurar este canal.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const cfg = readConfig();

    if (sub === 'status') {
      const embed = buildStatusEmbed(interaction.guild, cfg.levelUpChannelId);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'set') {
      const channel = interaction.options.getChannel('canal');
      if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
        return interaction.reply({ content: '❌ Debes seleccionar un canal de texto o anuncios válido.', ephemeral: true });
      }

      // Validar permisos del bot en el canal
      const botMember = interaction.guild.members.me;
      if (botMember && !channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
        return interaction.reply({ 
          content: `⚠️ El bot no tiene permisos para ver o enviar mensajes en <#${channel.id}>. Por favor asegúrate de otorgarle permisos.`, 
          ephemeral: true 
        });
      }

      writeConfig(current => ({
        ...current,
        levelUpChannelId: channel.id
      }));

      logger.info(`[config] Canal de level-up configurado a ${channel.id} en ${interaction.guild.id}`);

      const embed = new EmbedBuilder()
        .setTitle('✅ Canal de Level-Up Configurado')
        .setDescription(`A partir de ahora, todos los anuncios de subida de nivel se enviarán en <#${channel.id}>.`)
        .setColor(0x2ECC71)
        .addFields(
          { name: 'Canal', value: `<#${channel.id}> (\`${channel.id}\`)`, inline: true },
          { name: 'Configurado por', value: `${interaction.user}`, inline: true }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'remove') {
      writeConfig(current => {
        const next = { ...current };
        delete next.levelUpChannelId;
        return next;
      });

      logger.info(`[config] Canal de level-up removido en ${interaction.guild.id}`);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Canal de Level-Up Removido')
        .setDescription('El canal fijo de anuncios de subida de nivel ha sido eliminado. Los anuncios se enviarán en el mismo canal donde el usuario interactúe.')
        .setColor(0xE74C3C)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Este comando solo puede usarse en un servidor.');
    }

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild) &&
        !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Necesitas permisos de **Administrar Servidor** para configurar este canal.');
    }

    const sub = (args[0] || '').toLowerCase();
    const cfg = readConfig();

    if (sub === 'status' || sub === 'info' || sub === 'ver' || (!sub && args.length === 0)) {
      const embed = buildStatusEmbed(message.guild, cfg.levelUpChannelId);
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'remove' || sub === 'quitar' || sub === 'reset' || sub === 'off' || sub === 'del' || sub === 'delete') {
      writeConfig(current => {
        const next = { ...current };
        delete next.levelUpChannelId;
        return next;
      });

      logger.info(`[config] Canal de level-up removido vía prefix en ${message.guild.id}`);

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Canal de Level-Up Removido')
        .setDescription('El canal fijo de anuncios de subida de nivel ha sido eliminado. Los anuncios se enviarán en el mismo canal donde el usuario interactúe.')
        .setColor(0xE74C3C)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    // Si es 'set #canal' o directamente '#canal'
    const channelTarget = message.mentions.channels.first() ||
      (args[1] ? await message.guild.channels.fetch(args[1].replace(/[<#>]/g, '')).catch(() => null) : null) ||
      (args[0] && args[0] !== 'set' ? await message.guild.channels.fetch(args[0].replace(/[<#>]/g, '')).catch(() => null) : null);

    if (!channelTarget) {
      return message.reply({
        content: '❌ **Uso incorrecto.**\n' +
          '• Para establecer canal: `&setlevelchannel set #canal` o `&setlevelchannel #canal`\n' +
          '• Para remover canal: `&setlevelchannel remove`\n' +
          '• Para ver estado: `&setlevelchannel status`'
      });
    }

    if (channelTarget.type !== ChannelType.GuildText && channelTarget.type !== ChannelType.GuildAnnouncement) {
      return message.reply('❌ Debes mencionar un canal de texto o anuncios válido.');
    }

    // Validar permisos del bot en el canal
    const botMember = message.guild.members.me;
    if (botMember && !channelTarget.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      return message.reply(`⚠️ El bot no tiene permisos para ver o enviar mensajes en <#${channelTarget.id}>. Por favor otórgale permisos.`);
    }

    writeConfig(current => ({
      ...current,
      levelUpChannelId: channelTarget.id
    }));

    logger.info(`[config] Canal de level-up configurado a ${channelTarget.id} vía prefix en ${message.guild.id}`);

    const embed = new EmbedBuilder()
      .setTitle('✅ Canal de Level-Up Configurado')
      .setDescription(`A partir de ahora, todos los anuncios de subida de nivel se enviarán en <#${channelTarget.id}>.`)
      .setColor(0x2ECC71)
      .addFields(
        { name: 'Canal', value: `<#${channelTarget.id}> (\`${channelTarget.id}\`)`, inline: true },
        { name: 'Configurado por', value: `${message.author}`, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },

  buildStatusEmbed
};
