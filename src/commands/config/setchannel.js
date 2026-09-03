const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { writeConfig } = require('../../utils/configCache');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Establece un canal para logs, MFA, alertas o notificaciones de nivel')
    .addStringOption(opt => opt.setName('tipo').setDescription('Tipo de canal').setRequired(true)
      .addChoices(
        { name: 'levelup (Notificaciones de nivel)', value: 'levelUpChannelId' },
        { name: 'log (Registros del sistema)', value: 'logChannelId' },
        { name: 'mfa (Autenticación MFA)', value: 'mfaChannelId' },
        { name: 'alerta (Alertas generales)', value: 'alertChannelId' },
        { name: 'boost (Notificaciones de boost)', value: 'boostChannelId' }
      ))
    .addChannelOption(opt => 
      opt.setName('canal')
        .setDescription('Canal de texto donde se enviarán las notificaciones')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const tipo = interaction.options.getString('tipo');
    const channel = interaction.options.getChannel('canal');
    if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
      return interaction.reply({ content: '❌ Debes seleccionar un canal de texto o anuncios válido.', ephemeral: true });
    }

    writeConfig(current => ({
      ...current,
      [tipo]: channel.id
    }));

    await interaction.reply({ content: `✅ Canal de **${tipo.replace('ChannelId','')}** establecido: <#${channel.id}>`, ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator) &&
        !message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('❌ No tienes permisos de administrador.');
    }
    const rawTipo = (args[0] || '').toLowerCase();
    const typeMap = {
      levelup: 'levelUpChannelId',
      level: 'levelUpChannelId',
      niveles: 'levelUpChannelId',
      log: 'logChannelId',
      logs: 'logChannelId',
      mfa: 'mfaChannelId',
      alerta: 'alertChannelId',
      alertas: 'alertChannelId',
      boost: 'boostChannelId',
      boosts: 'boostChannelId'
    };
    const tipo = typeMap[rawTipo];
    const channel = message.mentions.channels.first() || (args[1] ? await message.guild.channels.fetch(args[1].replace(/[<#>]/g, '')).catch(() => null) : null);
    if (!tipo || !channel) {
      return message.reply('❌ Uso: `&setchannel <levelup|log|mfa|alerta|boost> #canal`');
    }

    writeConfig(current => ({
      ...current,
      [tipo]: channel.id
    }));

    await message.reply(`✅ Canal de **${rawTipo}** establecido: <#${channel.id}>`);
  }
};