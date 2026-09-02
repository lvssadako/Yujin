const { PermissionFlagsBits, ChannelType } = require('discord.js');
const boosterColorService = require('../services/boost/boosterColorService');
const logger = require('../utils/logger');

function resolveRole(guild, arg) {
  if (!arg) return null;
  const mention = arg.match(/^<@&(\d+)>$/);
  if (mention) {
    return guild.roles.cache.get(mention[1]) || null;
  }
  if (/^\d{17,19}$/.test(arg)) {
    return guild.roles.cache.get(arg) || null;
  }
  return guild.roles.cache.find(r => r.name.toLowerCase() === arg.toLowerCase()) || null;
}

function resolveChannel(guild, arg) {
  if (!arg) return null;
  const mention = arg.match(/^<#(\d+)>$/);
  if (mention) {
    return guild.channels.cache.get(mention[1]) || null;
  }
  if (/^\d{17,19}$/.test(arg)) {
    return guild.channels.cache.get(arg) || null;
  }
  return guild.channels.cache.find(c => c.name.toLowerCase() === arg.toLowerCase()) || null;
}

module.exports = {
  name: 'boostercolors',
  description: 'Gestión y envío de autoroles de color para Boosters con prefijo',
  aliases: ['boostercolor', 'colorbooster', 'colorboosters', 'bcolors'],

  async execute(message, args, client) {
    const { guild, member } = message;
    if (!guild) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }

    // Validar permisos administrativos
    const hasAdmin = member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
                     member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
                     member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);

    if (!hasAdmin) {
      return message.reply('🚫 Necesitas permisos de Administrador o Gestionar Roles para usar este comando.');
    }

    const sub = (args[0] || 'panel').toLowerCase();

    // 1. ABRIR PANEL INTERACTIVO DE CONFIGURACIÓN
    if (sub === 'panel' || (!args[0] && sub === 'panel')) {
      const adminEmbed = boosterColorService.buildAdminEmbed(guild.id, guild);
      const adminComp = boosterColorService.buildAdminComponents(guild.id);

      return message.reply({
        embeds: [adminEmbed],
        components: adminComp
      });
    }

    // 2. ENVIAR EMBED AL CANAL (send / enviar)
    if (sub === 'send' || sub === 'enviar') {
      const targetChannel = resolveChannel(guild, args[1]) || message.channel;
      const cfg = boosterColorService.getConfig(guild.id);

      if (cfg.colors.length === 0) {
        return message.reply('⚠️ **Aviso:** No has configurado ningún color todavía.\nUsa `&boostercolors panel` o `&boostercolors add` para añadir colores antes de publicar el embed.');
      }

      const pubEmbed = boosterColorService.buildPublicEmbed(guild.id, guild);
      const pubComp = boosterColorService.buildPublicComponents(guild.id);

      try {
        const sentMsg = await targetChannel.send({ embeds: [pubEmbed], components: pubComp });
        boosterColorService.saveConfig(guild.id, c => ({
          ...c,
          sentMessages: [...c.sentMessages, { channelId: targetChannel.id, messageId: sentMsg.id }]
        }));

        return message.reply(`🚀 ¡Embed de colores de Booster publicado con éxito en <#${targetChannel.id}>!\n[Ir al mensaje](${sentMsg.url})`);
      } catch (err) {
        logger.error('[boostercolors prefix] Error enviando mensaje:', err);
        return message.reply('❌ No se pudo enviar el embed al canal. Verifica que el bot tenga permisos para ver y escribir en ese canal.');
      }
    }

    // 3. AÑADIR COLOR DIRECTAMENTE (add / agregar)
    if (sub === 'add' || sub === 'agregar') {
      const role = resolveRole(guild, args[1]);
      if (!role) {
        return message.reply('❌ **Debes mencionar o colocar la ID de un rol válido.**\nEjemplo: `&boostercolors add @RosaNeon Rosa Neón 🌸`');
      }

      // El nombre puede tener varias palabras, el último arg puede ser emoji
      const rawRest = args.slice(2);
      if (rawRest.length === 0) {
        return message.reply('❌ **Debes especificar el nombre del color.**\nEjemplo: `&boostercolors add @RosaNeon Rosa Neón 🌸`');
      }

      let emoji = '';
      let nameParts = [...rawRest];
      const lastToken = rawRest[rawRest.length - 1];

      // Detectar si el último token es un emoji (unicode o custom discord)
      if (/(\p{Extended_Pictographic}|<a?:[a-zA-Z0-9_~-]+:\d+>)/u.test(lastToken) && rawRest.length > 1) {
        emoji = lastToken;
        nameParts.pop();
      }

      const name = nameParts.join(' ').trim();
      const newId = `color_${Date.now()}`;

      boosterColorService.saveConfig(guild.id, c => ({
        ...c,
        colors: [...c.colors.filter(col => col.roleId !== role.id), { id: newId, name, roleId: role.id, emoji }]
      }));

      const emojiPrefix = emoji ? `${emoji} ` : '';
      return message.reply(`✅ ¡Color ${emojiPrefix}**${name}** (<@&${role.id}>) añadido a la lista de opciones para Boosters!`);
    }

    // 4. LISTAR COLORES (list / ver)
    if (sub === 'list' || sub === 'ver') {
      const adminEmbed = boosterColorService.buildAdminEmbed(guild.id, guild);
      return message.reply({ embeds: [adminEmbed] });
    }

    // AYUDA DE USO
    return message.reply(
      '📖 **Comandos de Colores para Boosters con Prefijo:**\n' +
      '• `&boostercolors panel` — Abre el panel interactivo completo de configuración\n' +
      '• `&boostercolors send [#canal]` — Publica el embed con el menú en un canal\n' +
      '• `&boostercolors add <@rol> <Nombre> [emoji]` — Añade un rol de color directamente\n' +
      '• `&boostercolors list` — Muestra la lista de colores actuales'
    );
  }
};
