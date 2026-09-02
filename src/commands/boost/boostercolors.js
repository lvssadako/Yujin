const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require('discord.js');
const boosterColorService = require('../../services/boost/boosterColorService');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boostercolors')
    .setDescription('Panel de administración y envío de autoroles de color exclusivos para Boosters')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Abre el panel de configuración interactivo para gestionar colores y diseñar el embed')
    )
    .addSubcommand(sub =>
      sub
        .setName('send')
        .setDescription('Publica el embed público de autorol de colores en un canal')
        .addChannelOption(opt =>
          opt
            .setName('canal')
            .setDescription('Canal donde se publicará el embed (por defecto el canal actual)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Añade un rol de color a la lista de opciones de booster')
        .addRoleOption(opt =>
          opt
            .setName('rol')
            .setDescription('Rol de Discord que se asignará')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('nombre')
            .setDescription('Nombre visible del color (ej: Rosa Neón, Azul Eléctrico)')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('emoji')
            .setDescription('Emoji representativo (ej: 🌸, 💎, 🔥)')
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription('Muestra la lista de colores configurados para los boosters')
    ),

  async execute(interaction, client) {
    const { guild, member } = interaction;
    if (!guild) {
      return interaction.reply({ content: '❌ Este comando solo puede usarse en servidores.', ephemeral: true });
    }

    const hasAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
                     member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
                     member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
                     interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
                     interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles);

    if (!hasAdmin) {
      return interaction.reply({
        content: '🚫 Necesitas permisos de Administrador o Gestionar Roles para usar este comando.',
        ephemeral: true
      });
    }

    const sub = interaction.options.getSubcommand();

    // 1. ABRIR PANEL DE CONTROL INTERACTIVO
    if (sub === 'panel') {
      const adminEmbed = boosterColorService.buildAdminEmbed(guild.id, guild);
      const adminComp = boosterColorService.buildAdminComponents(guild.id);

      return interaction.reply({
        embeds: [adminEmbed],
        components: adminComp,
        ephemeral: true
      });
    }

    // 2. ENVIAR EMBED AL CANAL
    if (sub === 'send') {
      await interaction.deferReply({ ephemeral: true });
      const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
      const cfg = boosterColorService.getConfig(guild.id);

      if (cfg.colors.length === 0) {
        return interaction.editReply({
          content: '⚠️ **Aviso:** No has configurado ningún color todavía.\nUsa `/boostercolors panel` o `/boostercolors add` para añadir colores antes de publicar el embed.'
        });
      }

      const pubEmbed = boosterColorService.buildPublicEmbed(guild.id, guild);
      const pubComp = boosterColorService.buildPublicComponents(guild.id);

      try {
        const sentMsg = await targetChannel.send({ embeds: [pubEmbed], components: pubComp });
        boosterColorService.saveConfig(guild.id, c => ({
          ...c,
          sentMessages: [...c.sentMessages, { channelId: targetChannel.id, messageId: sentMsg.id }]
        }));

        return interaction.editReply({
          content: `🚀 ¡Embed de colores de Booster publicado con éxito en <#${targetChannel.id}>!\n[Ir al mensaje](${sentMsg.url})`
        });
      } catch (err) {
        logger.error('[boostercolors cmd] Error sending embed:', err);
        return interaction.editReply({
          content: '❌ No se pudo enviar el embed al canal. Verifica que el bot tenga permisos de lectura y escritura en ese canal.'
        });
      }
    }

    // 3. AÑADIR COLOR DIRECTAMENTE
    if (sub === 'add') {
      const role = interaction.options.getRole('rol');
      const name = interaction.options.getString('nombre').trim();
      const emoji = interaction.options.getString('emoji')?.trim() || '';

      const newId = `color_${Date.now()}`;
      boosterColorService.saveConfig(guild.id, c => ({
        ...c,
        colors: [...c.colors.filter(col => col.roleId !== role.id), { id: newId, name, roleId: role.id, emoji }]
      }));

      const emojiPrefix = emoji ? `${emoji} ` : '';
      return interaction.reply({
        content: `✅ ¡Color ${emojiPrefix}**${name}** asociado al rol <@&${role.id}> añadido a las opciones de booster!`,
        ephemeral: true
      });
    }

    // 4. LISTAR COLORES
    if (sub === 'list') {
      const adminEmbed = boosterColorService.buildAdminEmbed(guild.id, guild);
      return interaction.reply({
        embeds: [adminEmbed],
        ephemeral: true
      });
    }
  },

  async executePrefix(message, args, client) {
    const prefixCmd = require('../../prefixCommands/boostercolors');
    return prefixCmd.execute(message, args, client);
  }
};
