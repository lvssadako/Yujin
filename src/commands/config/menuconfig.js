const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType
} = require('discord.js');

const configPath = path.join(__dirname, '..', 'config.json');

// helper read/write (seguro si no existe)
function readConfig() {
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    return {};
  }
}
function writeConfig(cfg) {
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
}

// generate a safe key from name
function genKey(name) {
  const base = name.toLowerCase().replace(/\s+/g, '_').replace(/[^\w\-_]/g, '');
  return `${base}_${Date.now().toString(36)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('menuconfig')
    .setDescription('Configura el menú de colores (solo administradores)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('setvip')
        .setDescription('Configura el rol requerido para usar el menú')
        .addRoleOption(r =>
          r
            .setName('rol')
            .setDescription('Rol que será requerido (por ejemplo Booster)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('addcolor')
        .setDescription('Agrega un color al menú')
        .addStringOption(s =>
          s
            .setName('name')
            .setDescription('Nombre del color (puede incluir emoji y mayúsculas)')
            .setRequired(true)
        )
        .addRoleOption(r =>
          r
            .setName('role')
            .setDescription('Rol que se asignará cuando seleccionen este color')
            .setRequired(true)
        )
    )
    // removecolor ahora interactivo (sin param)
    .addSubcommand(sub => sub.setName('removecolor').setDescription('Elimina colores (interactivo)'))
    .addSubcommand(sub => sub.setName('ver').setDescription('Muestra la configuración actual'))
    .addSubcommand(sub => sub.setName('crear').setDescription('Crea y envía el menú en este canal'))
    .addSubcommand(sub =>
      sub
        .setName('attach')
        .setDescription('Adjuntar un menú ya publicado para permitir futuras ediciones')
        .addChannelOption(c => c.setName('canal').setDescription('Canal del mensaje').setRequired(true))
        .addStringOption(s => s.setName('messageid').setDescription('ID del mensaje').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('apply').setDescription('Aplicar/Actualizar menú en los mensajes adjuntos')),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    // require admin (ManageRoles or Administrator)
    const member = interaction.member;
    if (!member.permissions.has(PermissionFlagsBits.Administrator) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '🚫 Necesitas permisos de Administrador o Administrar roles.', ephemeral: true });
    }

    const cfg = readConfig();

    try {
      if (sub === 'setvip') {
        const role = interaction.options.getRole('rol');
        cfg.vipRoleId = role.id;
        writeConfig(cfg);
        return interaction.reply({ content: `✅ Rol requerido configurado: ${role}`, ephemeral: true });
      }

      if (sub === 'addcolor') {
        const name = interaction.options.getString('name');
        const role = interaction.options.getRole('role');
        cfg.colors = cfg.colors || {};
        const key = genKey(name);
        cfg.colors[key] = { name, roleId: role.id };
        writeConfig(cfg);
        return interaction.reply({ content: `🎨 Color agregado: **${name}** → ${role}`, ephemeral: true });
      }

      if (sub === 'removecolor') {
        cfg.colors = cfg.colors || {};
        const entries = Object.entries(cfg.colors || {});
        if (entries.length === 0) {
          return interaction.reply({ content: '⚠️ No hay colores configurados para eliminar.', ephemeral: true });
        }

        // ordenar por nombre para UX consistente
        entries.sort((a, b) => {
          const na = (a[1].name || '').toLowerCase();
          const nb = (b[1].name || '').toLowerCase();
          return na.localeCompare(nb);
        });

        // construir opciones (Discord limita a 25)
        const maxShow = 25;
        const showEntries = entries.slice(0, maxShow);
        const options = showEntries.map(([k, c]) => ({
          label: (c.name || k).slice(0, 100),
          value: k,
          description: c.roleId ? `Rol: ${c.roleId}` : 'Sin rol'
        }));

        const select = new StringSelectMenuBuilder()
          .setCustomId('menuconfig_removeselect')
          .setPlaceholder('Selecciona los colores a borrar')
          .setMinValues(1)
          .setMaxValues(Math.min(25, options.length))
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(select);

        // si hay más de 25, avisar al admin y listar los que no se muestran
        let notice = '';
        if (entries.length > maxShow) {
          const remaining = entries.slice(maxShow).map(([k, c]) => c.name || k);
          notice = `\n⚠️ Hay ${entries.length - maxShow} colores adicionales que no aparecen en el selector (solo se muestran los primeros ${maxShow}).\n`;
        }

        await interaction.reply({
          content: `Selecciona los colores que deseas borrar:${notice}`,
          components: [row],
          ephemeral: true
        });
        const msg = await interaction.fetchReply();

        const collector = msg.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          time: 60_000,
          filter: i => i.user.id === interaction.user.id && i.customId === 'menuconfig_removeselect'
        });

        collector.on('collect', async sel => {
          const toDelete = sel.values; // keys
          const names = toDelete.map(k => cfg.colors[k]?.name || k);
          const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm_delete').setLabel(`Borrar (${toDelete.length})`).setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
          );
          await sel.update({ content: `Confirmar borrado: ${names.join(', ')}`, components: [confirmRow], ephemeral: true });

          const btnMsg = await interaction.fetchReply();
          const btnCollector = btnMsg.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 30_000,
            filter: i => i.user.id === interaction.user.id && (i.customId === 'confirm_delete' || i.customId === 'cancel_delete')
          });

          btnCollector.on('collect', async btn => {
            if (btn.customId === 'cancel_delete') {
              await btn.update({ content: 'Operación cancelada.', components: [] });
              btnCollector.stop();
              collector.stop();
              return;
            }

            // borrar keys
            for (const k of toDelete) delete cfg.colors[k];
            writeConfig(cfg);
            await btn.update({ content: `✅ Borrados: ${names.join(', ')}`, components: [] });

            // actualizar menús adjuntos si existen
            if (Array.isArray(cfg.menus) && cfg.menus.length > 0) {
              const optionsNow = Object.keys(cfg.colors || {}).slice(0, 25).map(k => {
                const c = cfg.colors[k];
                return { label: (c.name || k).slice(0, 100), value: k, description: `roleId: ${c.roleId || 'N/A'}`.slice(0, 100) };
              });
              const newSelect = new StringSelectMenuBuilder()
                .setCustomId('lco_color_menu')
                .setPlaceholder('Selecciona tu color')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(optionsNow);
              const newRow = new ActionRowBuilder().addComponents(newSelect);

              for (const m of cfg.menus) {
                try {
                  const ch = await client.channels.fetch(m.channelId);
                  const mm = await ch.messages.fetch(m.messageId);
                  await mm.edit({ components: [newRow] }).catch(() => {});
                } catch {}
              }
            }

            btnCollector.stop();
            collector.stop();
          });
        });

        collector.on('end', async () => {
          try { await interaction.editReply({ components: [] }); } catch {}
        });

        return;
      }

      if (sub === 'ver') {
        cfg.colors = cfg.colors || {};
        const vip = cfg.vipRoleId ? `<@&${cfg.vipRoleId}>` : 'No configurado';
        const list = Object.values(cfg.colors).length
          ? Object.values(cfg.colors).map(c => `• ${c.name} → <@&${c.roleId}>`).join('\n')
          : 'Sin colores configurados.';
        const embed = new EmbedBuilder()
          .setTitle('⚙️ Configuración del menú de colores')
          .addFields(
            { name: 'Rol requerido', value: vip, inline: false },
            { name: 'Colores', value: list, inline: false }
          )
          .setColor('#8BD3FF')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      if (sub === 'crear') {
        cfg.colors = cfg.colors || {};
        if (!cfg.vipRoleId) return interaction.reply({ content: '❌ Configura primero el rol requerido con /menuconfig setvip @Rol', ephemeral: true });
        if (Object.keys(cfg.colors).length === 0) return interaction.reply({ content: '❌ No hay colores configurados. Usa /menuconfig addcolor', ephemeral: true });

        const options = [{ label: '❌ Quitar color', value: 'remove_color', description: 'Elimina tu color actual' }];
        for (const [key, obj] of Object.entries(cfg.colors)) {
          const label = obj.name.length > 100 ? obj.name.slice(0, 96) + '...' : obj.name;
          options.push({ label, value: key, description: `Seleccionar ${obj.name}`.slice(0, 100) });
        }

        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
          .setCustomId('lco_color_menu')
          .setPlaceholder('🎨 Selecciona tu color (solo 1)')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options)
        );

        const embed = new EmbedBuilder()
          .setTitle('🎨 Selector de colores')
          .setDescription(`Selecciona **un** color. Necesitas el rol <@&${cfg.vipRoleId}> para usar este menú.`)
          .setColor('#f4a4ff');

        await interaction.reply({ content: '✅ Menú creado en este canal.', ephemeral: true });
        const posted = await interaction.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
        if (posted) {
          cfg.menus = cfg.menus || [];
          // guardar si no existe ya
          if (!cfg.menus.some(m => m.channelId === posted.channelId && m.messageId === posted.id)) {
            cfg.menus.push({ channelId: posted.channelId, messageId: posted.id });
            writeConfig(cfg);
          }
        }
        return;
      }

      if (sub === 'attach') {
        const channel = interaction.options.getChannel('canal');
        const messageId = interaction.options.getString('messageid');
        try {
          const ch = await client.channels.fetch(channel.id);
          const mm = await ch.messages.fetch(messageId);
          cfg.menus = cfg.menus || [];
          if (!cfg.menus.some(m => m.channelId === ch.id && m.messageId === mm.id)) {
            cfg.menus.push({ channelId: ch.id, messageId: mm.id });
            writeConfig(cfg);
            return interaction.reply({ content: '✅ Mensaje adjuntado y guardado para futuras ediciones.', ephemeral: true });
          } else {
            return interaction.reply({ content: '⚠️ Ese mensaje ya está adjuntado.', ephemeral: true });
          }
        } catch (err) {
          return interaction.reply({ content: '❌ No se pudo encontrar el mensaje. Verifica IDs y permisos.', ephemeral: true });
        }
      }

      if (sub === 'apply') {
        cfg.colors = cfg.colors || {};
        const options = Object.entries(cfg.colors).slice(0, 25).map(([k, v]) => ({
          label: v.name || k,
          value: k,
          description: `roleId: ${v.roleId || 'N/A'}`.slice(0, 100)
        }));
        // always include remove option
        options.unshift({ label: '❌ Quitar color', value: 'remove_color', description: 'Elimina tu color actual' });

        const select = new StringSelectMenuBuilder()
          .setCustomId('lco_color_menu')
          .setPlaceholder('Selecciona tu color')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(select);

        // if no attached menus, publish in current channel and save
        if (!Array.isArray(cfg.menus) || cfg.menus.length === 0) {
          const posted = await interaction.channel.send({ content: 'Selecciona tu color:', components: [row] }).catch(() => null);
          if (posted) {
            cfg.menus = [{ channelId: posted.channelId, messageId: posted.id }];
            writeConfig(cfg);
            return interaction.reply({ content: '✅ Menú creado y guardado en este canal.', ephemeral: true });
          } else {
            return interaction.reply({ content: '❌ No se pudo publicar el menú en este canal.', ephemeral: true });
          }
        }

        let updated = 0;
        for (const m of cfg.menus) {
          try {
            const ch = await client.channels.fetch(m.channelId);
            const mm = await ch.messages.fetch(m.messageId);
            await mm.edit({ content: 'Selecciona tu color:', components: [row] });
            updated++;
          } catch (e) {
            // ignorar
          }
        }
        writeConfig(cfg);
        return interaction.reply({ content: `✅ Menús actualizados: ${updated}`, ephemeral: true });
      }

    } catch (err) {
      logger.error('menuconfig error:', err);
      return interaction.reply({ content: '❌ Error interno.', ephemeral: true });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator) && !message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply('❌ Necesitas permisos de Administrador o Administrar roles.');
    }
    const sub = (args[0] || 'ver').toLowerCase();
    const cfg = readConfig();

    if (sub === 'ver' || sub === 'list') {
      cfg.colors = cfg.colors || {};
      const vip = cfg.vipRoleId ? `<@&${cfg.vipRoleId}>` : 'No configurado';
      const list = Object.values(cfg.colors).length
        ? Object.values(cfg.colors).map(c => `• ${c.name} → <@&${c.roleId}>`).join('\n')
        : 'Sin colores configurados.';
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Configuración del menú de colores')
        .addFields(
          { name: 'Rol requerido', value: vip, inline: false },
          { name: 'Colores', value: list, inline: false }
        )
        .setColor('#8BD3FF')
        .setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'setvip') {
      const role = message.mentions.roles.first() || (args[1] ? await message.guild.roles.fetch(args[1]).catch(() => null) : null);
      if (!role) return message.reply('❌ Uso: `&menuconfig setvip @rol`');
      cfg.vipRoleId = role.id;
      writeConfig(cfg);
      return message.reply(`✅ Rol requerido configurado: ${role.name}`);
    }

    if (sub === 'crear' || sub === 'send') {
      cfg.colors = cfg.colors || {};
      if (!cfg.vipRoleId) return message.reply('❌ Configura primero el rol requerido con `&menuconfig setvip @Rol`');
      if (Object.keys(cfg.colors).length === 0) return message.reply('❌ No hay colores configurados.');

      const options = [{ label: '❌ Quitar color', value: 'remove_color', description: 'Elimina tu color actual' }];
      for (const [key, obj] of Object.entries(cfg.colors)) {
        const label = obj.name.length > 100 ? obj.name.slice(0, 96) + '...' : obj.name;
        options.push({ label, value: key, description: `Seleccionar ${obj.name}`.slice(0, 100) });
      }

      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId('lco_color_menu')
        .setPlaceholder('🎨 Selecciona tu color (solo 1)')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(options)
      );

      const embed = new EmbedBuilder()
        .setTitle('🎨 Selector de colores')
        .setDescription(`Selecciona **un** color. Necesitas el rol <@&${cfg.vipRoleId}> para usar este menú.`)
        .setColor('#f4a4ff');

      await message.channel.send({ embeds: [embed], components: [row] });
      return message.reply('✅ Menú creado en este canal.');
    }

    return message.reply('❌ Subcomandos: `&menuconfig ver`, `&menuconfig setvip @rol`, `&menuconfig crear`');
  }
};