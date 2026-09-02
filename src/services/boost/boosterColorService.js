const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const logger = require('../../utils/logger');
const { COLORS } = require('../../utils/embedFactory');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const storePath = path.join(dataDir, 'boosterColors.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readAll() {
  try {
    if (!fs.existsSync(storePath)) return {};
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (e) {
    logger.warn('[boosterColorService] Error reading boosterColors.json:', e?.message);
    return {};
  }
}

function writeAll(data) {
  try {
    const tmp = `${storePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, storePath);
  } catch (e) {
    logger.error('[boosterColorService] Error writing boosterColors.json:', e);
  }
}

function getConfig(guildId) {
  const all = readAll();
  const cfg = all[guildId] || {};
  return {
    title: cfg.title || '🎨 Colores Exclusivos para Boosters',
    description: cfg.description || '¡Muchas gracias por apoyar al servidor con tus **Server Boosts**!\n\nSelecciona el color que desees para tu nombre en el chat desde el menú de abajo. Si seleccionas otro color, se reemplazará automáticamente.',
    footer: cfg.footer || 'Yujin Bot • Beneficios Exclusivos para Boosters',
    bannerUrl: cfg.bannerUrl || '',
    colors: Array.isArray(cfg.colors) ? cfg.colors : [],
    sentMessages: Array.isArray(cfg.sentMessages) ? cfg.sentMessages : []
  };
}

function saveConfig(guildId, updateFn) {
  const all = readAll();
  const current = getConfig(guildId);
  const updated = typeof updateFn === 'function' ? updateFn(current) : { ...current, ...updateFn };
  all[guildId] = updated;
  writeAll(all);
  return updated;
}

function isMemberBooster(member) {
  if (!member) return false;
  if (member.premiumSince) return true;
  const boosterRole = member.guild?.roles?.premiumSubscriberRole;
  if (boosterRole && member.roles?.cache?.has(boosterRole.id)) return true;
  return false;
}

// Genera el embed público para los miembros
function buildPublicEmbed(guildId, guild) {
  const cfg = getConfig(guildId);
  const embed = new EmbedBuilder()
    .setColor(0xF47FFF) // Tono Booster Magenta
    .setAuthor({
      name: `${guild?.name || 'Servidor'} • Sistema de Autoroles`,
      iconURL: guild?.iconURL?.({ size: 128 }) || undefined
    })
    .setTitle(cfg.title)
    .setDescription(cfg.description)
    .setFooter({ text: cfg.footer, iconURL: guild?.client?.user?.displayAvatarURL?.() })
    .setTimestamp();

  if (cfg.bannerUrl && /^https?:\/\//i.test(cfg.bannerUrl)) {
    embed.setImage(cfg.bannerUrl);
  }

  // Lista de colores configurados en campos organizados
  if (cfg.colors.length > 0) {
    const listFormatted = cfg.colors.map((c, i) => {
      const emoji = c.emoji ? `${c.emoji} ` : '🔹 ';
      return `${i + 1}. ${emoji}**${c.name}** — <@&${c.roleId}>`;
    }).join('\n');

    embed.addFields({
      name: '🌈 Colores Disponibles',
      value: listFormatted.length > 1024 ? listFormatted.slice(0, 1020) + '...' : listFormatted,
      inline: false
    });
  } else {
    embed.addFields({
      name: '🌈 Colores Disponibles',
      value: '*Aún no hay colores configurados por la administración.*',
      inline: false
    });
  }

  embed.addFields({
    name: '🔒 Requisito',
    value: '`🚀 Server Booster Activo` (Se valida automáticamente al seleccionar)',
    inline: false
  });

  return embed;
}

// Genera los componentes del embed público (Select Menu con opciones de color)
function buildPublicComponents(guildId) {
  const cfg = getConfig(guildId);
  const rows = [];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('booster_color_select')
    .setPlaceholder('🎨 Elige un color para tu nombre...');

  if (cfg.colors.length === 0) {
    selectMenu.addOptions([
      new StringSelectMenuOptionBuilder()
        .setLabel('Sin colores configurados')
        .setDescription('El staff aún no ha agregado colores')
        .setValue('none')
    ]).setDisabled(true);
    rows.push(new ActionRowBuilder().addComponents(selectMenu));
    return rows;
  }

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Quitar Color / Sin Color')
      .setDescription('Remueve cualquier color de booster que tengas activo')
      .setEmoji('❌')
      .setValue('remove_booster_color')
  ];

  cfg.colors.slice(0, 24).forEach(c => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(c.name.slice(0, 50))
      .setDescription(`Asigna el rol ${c.name}`.slice(0, 100))
      .setValue(c.id);

    if (c.emoji) {
      const customMatch = c.emoji.match(/<a?:[a-zA-Z0-9_~-]+:(\d+)>/);
      if (customMatch) {
        opt.setEmoji(customMatch[1]);
      } else {
        opt.setEmoji(c.emoji);
      }
    }
    options.push(opt);
  });

  selectMenu.addOptions(options);
  rows.push(new ActionRowBuilder().addComponents(selectMenu));
  return rows;
}

// Genera el embed para el Panel Administrativo
function buildAdminEmbed(guildId, guild) {
  const cfg = getConfig(guildId);
  const colorCount = cfg.colors.length;

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary || 0x5865F2)
    .setAuthor({
      name: 'Panel de Configuración de Autoroles Booster',
      iconURL: guild?.iconURL?.({ size: 128 }) || undefined
    })
    .setTitle('⚙️ Gestión de Colores Exclusivos')
    .setDescription(
      'Configura los colores que estarán disponibles para los **Boosters** antes de enviar el embed al canal público.\n\n' +
      `**Estado Actual:** \`${colorCount}/24 Colores Configurados\`\n` +
      `**Canales Vinculados:** \`${cfg.sentMessages.length} embeds publicados\``
    )
    .setTimestamp();

  if (cfg.colors.length > 0) {
    const list = cfg.colors.map((c, i) => {
      const emoji = c.emoji ? `${c.emoji} ` : '';
      const exists = guild?.roles?.cache?.has(c.roleId) ? '✅' : '⚠️ *Rol no existe*';
      return `\`${i + 1}.\` ${emoji}**${c.name}** (<@&${c.roleId}>) • ${exists}`;
    }).join('\n');

    embed.addFields({
      name: '📋 Lista de Colores Configurados',
      value: list.length > 1024 ? list.slice(0, 1020) + '...' : list,
      inline: false
    });
  } else {
    embed.addFields({
      name: '📋 Lista de Colores Configurados',
      value: '*No hay colores agregados. Usa el botón "➕ Añadir Color" para comenzar.*',
      inline: false
    });
  }

  embed.addFields(
    { name: '📝 Título del Embed', value: `\`${cfg.title}\``, inline: true },
    { name: '🖼️ Banner', value: cfg.bannerUrl ? `[Ver Banner](${cfg.bannerUrl})` : '`Ninguno`', inline: true }
  );

  return embed;
}

// Genera los componentes del Panel Administrativo
function buildAdminComponents(guildId) {
  const cfg = getConfig(guildId);
  const rows = [];

  // Fila 1: Botones de Gestión
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('booster_color_panel_add')
      .setLabel('Añadir Color')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('booster_color_panel_remove')
      .setLabel('Eliminar Color')
      .setEmoji('➖')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cfg.colors.length === 0),
    new ButtonBuilder()
      .setCustomId('booster_color_panel_edit_text')
      .setLabel('Editar Texto / Banner')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('booster_color_panel_preview')
      .setLabel('Vista Previa')
      .setEmoji('👁️')
      .setStyle(ButtonStyle.Primary)
  );

  // Fila 2: Enviar a canal & Sincronizar
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('booster_color_panel_send_btn')
      .setLabel('Enviar Embed a un Canal')
      .setEmoji('🚀')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(cfg.colors.length === 0),
    new ButtonBuilder()
      .setCustomId('booster_color_panel_sync')
      .setLabel('Actualizar Mensajes Publicados')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(cfg.sentMessages.length === 0),
    new ButtonBuilder()
      .setCustomId('booster_color_panel_clear_all')
      .setLabel('Limpiar Todos')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(cfg.colors.length === 0)
  );

  rows.push(row1, row2);
  return rows;
}

module.exports = {
  getConfig,
  saveConfig,
  isMemberBooster,
  buildPublicEmbed,
  buildPublicComponents,
  buildAdminEmbed,
  buildAdminComponents,

  // Manejador central de todas las interacciones de colores booster
  async handleInteraction(interaction) {
    const { customId, guild, member } = interaction;
    if (!guild) return;

    try {
      // 1. SELECCIÓN DE COLOR PÚBLICO POR UN USUARIO
      if (customId === 'booster_color_select') {
        await interaction.deferReply({ ephemeral: true });

        if (!isMemberBooster(member)) {
          const boosterRole = guild.roles.premiumSubscriberRole;
          const roleMention = boosterRole ? `<@&${boosterRole.id}>` : '**Server Booster**';
          return interaction.editReply({
            content: `🔒 **Acceso Exclusivo:** Este menú de colores es solo para miembros con ${roleMention}.\n\n*¡Apoya al servidor con un Server Boost para desbloquear todos estos roles de color!*`
          });
        }

        const val = interaction.values[0];
        const cfg = getConfig(guild.id);
        const allColorRoleIds = cfg.colors.map(c => c.roleId).filter(Boolean);

        // Remover cualquier rol de color previo
        const currentRoleIds = member.roles?.cache?.filter(r => allColorRoleIds.includes(r.id)).map(r => r.id) || [];
        if (currentRoleIds.length > 0) {
          try {
            await member.roles.remove(currentRoleIds);
          } catch (e) {
            logger.warn('[boosterColorService] Error removiendo roles previos:', e?.message);
          }
        }

        if (val === 'remove_booster_color') {
          return interaction.editReply({
            content: '✅ **Color removido:** Se ha quitado tu rol de color de booster correctamente.'
          });
        }

        const selectedColor = cfg.colors.find(c => c.id === val);
        if (!selectedColor) {
          return interaction.editReply({ content: '❌ Ese color ya no está disponible en la configuración.' });
        }

        const targetRole = guild.roles.cache.get(selectedColor.roleId);
        if (!targetRole) {
          return interaction.editReply({ content: '❌ El rol configurado para este color no existe en el servidor.' });
        }

        // Validar permisos del bot
        const me = guild.members.me;
        if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.editReply({ content: '❌ El bot no tiene el permiso `Gestionar Roles`.' });
        }
        if (me.roles.highest.position <= targetRole.position) {
          return interaction.editReply({
            content: `❌ El rol del bot debe estar **por encima** del rol <@&${targetRole.id}> en la lista de roles del servidor.`
          });
        }

        try {
          await member.roles.add(targetRole.id);
          const emoji = selectedColor.emoji ? `${selectedColor.emoji} ` : '';
          return interaction.editReply({
            content: `✨ **¡Color Actualizado!** Se te ha asignado el color ${emoji}**${selectedColor.name}** (<@&${targetRole.id}>).`
          });
        } catch (err) {
          logger.error('[boosterColorService] Error asignando rol:', err);
          return interaction.editReply({ content: '❌ Error al asignar el rol. Revisa los permisos y jerarquía del bot.' });
        }
      }

      // Validar permisos administrativos para todo lo demás
      const hasAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
                       member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
                       member?.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
                       interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
                       interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles);

      if (!hasAdmin) {
        return interaction.reply({
          content: '🚫 Necesitas permisos de Administrador o Gestionar Roles para modificar este panel.',
          ephemeral: true
        });
      }

      // 2. BOTONES DEL PANEL ADMINISTRATIVO
      if (interaction.isButton()) {
        // A) Añadir Color (Muestra modal)
        if (customId === 'booster_color_panel_add') {
          const modal = new ModalBuilder()
            .setCustomId('booster_color_modal_add')
            .setTitle('Añadir Color de Booster');

          const nameInput = new TextInputBuilder()
            .setCustomId('color_name')
            .setLabel('Nombre del Color')
            .setPlaceholder('Ej: Rosa Neón, Azul Cielo, Oro...')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(50)
            .setRequired(true);

          const roleIdInput = new TextInputBuilder()
            .setCustomId('color_role_id')
            .setLabel('ID del Rol de Discord')
            .setPlaceholder('Pega la ID numérica del rol (Ej: 123456789012345678)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(17)
            .setMaxLength(22)
            .setRequired(true);

          const emojiInput = new TextInputBuilder()
            .setCustomId('color_emoji')
            .setLabel('Emoji identificador (Opcional)')
            .setPlaceholder('Ej: 🌸, 💎, 🔥...')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(35)
            .setRequired(false);

          modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(roleIdInput),
            new ActionRowBuilder().addComponents(emojiInput)
          );

          return interaction.showModal(modal);
        }

        // B) Eliminar Color (Muestra selector)
        if (customId === 'booster_color_panel_remove') {
          const cfg = getConfig(guild.id);
          if (cfg.colors.length === 0) {
            return interaction.reply({ content: '❌ No hay colores configurados para eliminar.', ephemeral: true });
          }

          const rmSelect = new StringSelectMenuBuilder()
            .setCustomId('booster_color_panel_remove_select')
            .setPlaceholder('🗑️ Selecciona el color que deseas eliminar...')
            .addOptions(
              cfg.colors.map(c => {
                const opt = new StringSelectMenuOptionBuilder()
                  .setLabel(c.name.slice(0, 50))
                  .setDescription(`ID: ${c.roleId}`.slice(0, 100))
                  .setValue(c.id);
                if (c.emoji) {
                  const customMatch = c.emoji.match(/<a?:[a-zA-Z0-9_~-]+:(\d+)>/);
                  if (customMatch) opt.setEmoji(customMatch[1]);
                  else opt.setEmoji(c.emoji);
                }
                return opt;
              })
            );

          return interaction.reply({
            content: '🗑️ Elige el color que deseas quitar de la lista:',
            components: [new ActionRowBuilder().addComponents(rmSelect)],
            ephemeral: true
          });
        }

        // C) Editar Texto / Banner
        if (customId === 'booster_color_panel_edit_text') {
          const cfg = getConfig(guild.id);
          const modal = new ModalBuilder()
            .setCustomId('booster_color_modal_edit_text')
            .setTitle('Personalizar Texto y Banner');

          const titleInput = new TextInputBuilder()
            .setCustomId('embed_title')
            .setLabel('Título del Embed')
            .setValue(cfg.title || '🎨 Colores Exclusivos para Boosters')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true);

          const descInput = new TextInputBuilder()
            .setCustomId('embed_desc')
            .setLabel('Descripción del Embed')
            .setValue(cfg.description || '')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1500)
            .setRequired(true);

          const bannerInput = new TextInputBuilder()
            .setCustomId('embed_banner')
            .setLabel('URL de Imagen / Banner (Opcional)')
            .setValue(cfg.bannerUrl || '')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('https://...')
            .setRequired(false);

          modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(descInput),
            new ActionRowBuilder().addComponents(bannerInput)
          );

          return interaction.showModal(modal);
        }

        // D) Vista Previa
        if (customId === 'booster_color_panel_preview') {
          const previewEmbed = buildPublicEmbed(guild.id, guild);
          const previewComponents = buildPublicComponents(guild.id);
          return interaction.reply({
            content: '👁️ **Vista Previa de cómo verán los miembros el embed:**',
            embeds: [previewEmbed],
            components: previewComponents,
            ephemeral: true
          });
        }

        // E) Enviar a Canal (Muestra selector de canales)
        if (customId === 'booster_color_panel_send_btn') {
          const channelSelect = new ChannelSelectMenuBuilder()
            .setCustomId('booster_color_panel_channel_select')
            .setPlaceholder('📢 Selecciona el canal donde enviar el autorol...')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

          return interaction.reply({
            content: '📢 ¿En qué canal deseas publicar el embed de colores de Booster?',
            components: [new ActionRowBuilder().addComponents(channelSelect)],
            ephemeral: true
          });
        }

        // F) Sincronizar Mensajes Publicados
        if (customId === 'booster_color_panel_sync') {
          await interaction.deferReply({ ephemeral: true });
          const cfg = getConfig(guild.id);
          let updatedCount = 0;
          const validSent = [];

          const pubEmbed = buildPublicEmbed(guild.id, guild);
          const pubComp = buildPublicComponents(guild.id);

          for (const item of cfg.sentMessages) {
            try {
              const ch = await guild.channels.fetch(item.channelId).catch(() => null);
              if (ch) {
                const msg = await ch.messages.fetch(item.messageId).catch(() => null);
                if (msg) {
                  await msg.edit({ embeds: [pubEmbed], components: pubComp });
                  validSent.push(item);
                  updatedCount++;
                }
              }
            } catch (e) {
              logger.warn('[boosterColorService] Sync error on message:', e?.message);
            }
          }

          saveConfig(guild.id, c => ({ ...c, sentMessages: validSent }));
          return interaction.editReply({
            content: `✅ Se sincronizaron y actualizaron **${updatedCount}** mensajes de colores en los canales del servidor.`
          });
        }

        // G) Limpiar Todos los Colores
        if (customId === 'booster_color_panel_clear_all') {
          saveConfig(guild.id, c => ({ ...c, colors: [] }));
          const newEmbed = buildAdminEmbed(guild.id, guild);
          const newComp = buildAdminComponents(guild.id);
          return interaction.update({ embeds: [newEmbed], components: newComp });
        }
      }

      // 3. SELECT MENUS ADMINISTRATIVOS
      if (interaction.isStringSelectMenu() && customId === 'booster_color_panel_remove_select') {
        const colorId = interaction.values[0];
        saveConfig(guild.id, c => ({
          ...c,
          colors: c.colors.filter(col => col.id !== colorId)
        }));

        const adminEmbed = buildAdminEmbed(guild.id, guild);
        const adminComp = buildAdminComponents(guild.id);

        return interaction.update({
          content: '✅ Color eliminado correctamente del panel.',
          embeds: [adminEmbed],
          components: adminComp
        });
      }

      if (interaction.isChannelSelectMenu() && customId === 'booster_color_panel_channel_select') {
        await interaction.deferReply({ ephemeral: true });
        const channelId = interaction.values[0];
        const targetChannel = await guild.channels.fetch(channelId).catch(() => null);

        if (!targetChannel) {
          return interaction.editReply({ content: '❌ No se pudo encontrar el canal seleccionado.' });
        }

        const pubEmbed = buildPublicEmbed(guild.id, guild);
        const pubComp = buildPublicComponents(guild.id);

        try {
          const sentMsg = await targetChannel.send({ embeds: [pubEmbed], components: pubComp });
          saveConfig(guild.id, c => ({
            ...c,
            sentMessages: [...c.sentMessages, { channelId: targetChannel.id, messageId: sentMsg.id }]
          }));

          return interaction.editReply({
            content: `🚀 ¡Embed publicado exitosamente en <#${targetChannel.id}>!\n[Ir al mensaje](${sentMsg.url})`
          });
        } catch (err) {
          logger.error('[boosterColorService] Error enviando mensaje al canal:', err);
          return interaction.editReply({
            content: '❌ Error al enviar el mensaje. Verifica que el bot tenga permisos para ver y escribir en ese canal.'
          });
        }
      }

      // 4. MODALES ADMINISTRATIVOS
      if (interaction.isModalSubmit()) {
        if (customId === 'booster_color_modal_add') {
          const name = interaction.fields.getTextInputValue('color_name').trim();
          const roleId = interaction.fields.getTextInputValue('color_role_id').trim();
          const emoji = interaction.fields.getTextInputValue('color_emoji')?.trim() || '';

          const role = guild.roles.cache.get(roleId);
          if (!role) {
            return interaction.reply({
              content: `❌ No se encontró ningún rol con la ID \`${roleId}\` en este servidor.`,
              ephemeral: true
            });
          }

          const newId = `color_${Date.now()}`;
          saveConfig(guild.id, c => ({
            ...c,
            colors: [...c.colors.filter(col => col.roleId !== roleId), { id: newId, name, roleId, emoji }]
          }));

          const adminEmbed = buildAdminEmbed(guild.id, guild);
          const adminComp = buildAdminComponents(guild.id);

          return interaction.reply({
            content: `✅ ¡Color **${name}** (<@&${roleId}>) añadido correctamente!`,
            embeds: [adminEmbed],
            components: adminComp,
            ephemeral: true
          });
        }

        if (customId === 'booster_color_modal_edit_text') {
          const title = interaction.fields.getTextInputValue('embed_title').trim();
          const description = interaction.fields.getTextInputValue('embed_desc').trim();
          const bannerUrl = interaction.fields.getTextInputValue('embed_banner')?.trim() || '';

          saveConfig(guild.id, c => ({
            ...c,
            title,
            description,
            bannerUrl
          }));

          const adminEmbed = buildAdminEmbed(guild.id, guild);
          const adminComp = buildAdminComponents(guild.id);

          return interaction.reply({
            content: '✅ ¡Diseño y textos del embed actualizados correctamente!',
            embeds: [adminEmbed],
            components: adminComp,
            ephemeral: true
          });
        }
      }
    } catch (error) {
      logger.error('[boosterColorService] Error en handleInteraction:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ Ocurrió un error al procesar esta acción.' }).catch(() => {});
      } else {
        await interaction.reply({ content: '❌ Ocurrió un error al procesar esta acción.', ephemeral: true }).catch(() => {});
      }
    }
  }
};
