const path = require('node:path');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../../utils/ui');
const { writeConfig } = require('../../utils/configCache');
const { DEFAULT_COIN, isValidCoinEmoji, getCoinEmoji, invalidateCoinEmoji } = require('../../utils/coinEmoji');
const logger = require('../../utils/logger');

const BUNDLED_ICON = path.join(__dirname, '..', '..', '..', 'assets', 'icons', 'coin.png');
const MAX_EMOJI_BYTES = 256 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const allowed = member => member?.permissions?.has?.(PermissionFlagsBits.Administrator) || member?.permissions?.has?.(PermissionFlagsBits.ManageGuildExpressions);
const sanitizeName = raw => (String(raw || 'yujin_coin').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32).padEnd(2, '_'));

function store(emoji) {
  writeConfig(cfg => {
    const next = { ...cfg };
    if (emoji) next.coinEmoji = emoji; else delete next.coinEmoji;
    return next;
  });
  invalidateCoinEmoji();
}

function view(title, text) {
  return { embeds: [createEmbed(COLORS.economy).setAuthor({ name: title }).setDescription(text)] };
}

// Lógica común a /coinicon y &coinicon.
async function run({ guild, member, sub, attachment, name, emojiText }) {
  if (!allowed(member)) return { content: '🚫 Necesitas permiso de Administrador o Gestionar Expresiones.' };

  if (sub === 'ver') {
    const current = getCoinEmoji();
    return view('Moneda del servidor', `Emoji actual: ${current}${current === DEFAULT_COIN ? '\n*Aún usa el emoji genérico. Usa `/coinicon subir` para crear el propio.*' : ''}`);
  }
  if (sub === 'restablecer') {
    store(null);
    return view('Moneda restablecida', `Se volvió al emoji genérico ${DEFAULT_COIN}.`);
  }
  if (sub === 'usar') {
    const value = String(emojiText || '').trim();
    if (!isValidCoinEmoji(value)) return { content: '❌ Indica un emoji válido (unicode o personalizado, por ejemplo `<:moneda:123456789012345678>`).' };
    const id = /:(\d+)>$/.exec(value)?.[1];
    if (id && !guild.client.emojis.cache.has(id)) return { content: '❌ No encuentro ese emoji: debe pertenecer a un servidor donde esté el bot.' };
    store(value);
    return view('Moneda actualizada', `Ahora la moneda se muestra como ${value}.`);
  }
  if (sub === 'subir') {
    if (!guild.members.me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return { content: '❌ El bot necesita el permiso **Gestionar Expresiones** para crear el emoji.' };
    }
    let source = BUNDLED_ICON;
    if (attachment) {
      if (!ALLOWED_TYPES.has(String(attachment.contentType || '').split(';')[0])) return { content: '❌ La imagen debe ser PNG, JPG, GIF o WEBP.' };
      if (Number(attachment.size) > MAX_EMOJI_BYTES) return { content: '❌ Discord limita los emojis a 256 KB. Reduce la imagen e inténtalo de nuevo.' };
      source = attachment.url;
    }
    try {
      const emoji = await guild.emojis.create({ attachment: source, name: sanitizeName(name), reason: 'Icono de la moneda del servidor' });
      store(emoji.toString());
      return view('¡Icono de moneda creado!', `La moneda ahora se muestra como ${emoji} en todo el bot.`);
    } catch (e) {
      logger.warn('[coinicon] No se pudo crear el emoji', { error: e?.message });
      return { content: '❌ No pude crear el emoji. Revisa que queden espacios libres de emojis en el servidor y que la imagen sea válida.' };
    }
  }
  return { content: 'Uso: `subir`, `usar <emoji>`, `restablecer` o `ver`.' };
}

module.exports = {
  name: 'coinicon',
  description: 'Configura el icono propio de la moneda del servidor',
  data: new SlashCommandBuilder()
    .setName('coinicon')
    .setDescription('Icono propio de la moneda del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('subir').setDescription('Crea el emoji de la moneda (con el icono incluido o tu imagen)')
      .addAttachmentOption(o => o.setName('imagen').setDescription('Imagen PNG/JPG/GIF/WEBP de hasta 256 KB (opcional)'))
      .addStringOption(o => o.setName('nombre').setDescription('Nombre del emoji (por defecto yujin_coin)').setMaxLength(32)))
    .addSubcommand(s => s.setName('usar').setDescription('Usa un emoji que ya existe')
      .addStringOption(o => o.setName('emoji').setDescription('Emoji unicode o personalizado').setRequired(true)))
    .addSubcommand(s => s.setName('restablecer').setDescription('Vuelve al emoji genérico'))
    .addSubcommand(s => s.setName('ver').setDescription('Muestra el emoji actual')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Solo funciona dentro de un servidor.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });
    const result = await run({
      guild: interaction.guild, member: interaction.member, sub: interaction.options.getSubcommand(),
      attachment: interaction.options.getAttachment('imagen'), name: interaction.options.getString('nombre'),
      emojiText: interaction.options.getString('emoji')
    });
    return interaction.editReply(result);
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('❌ Solo funciona dentro de un servidor.');
    const sub = (args[0] || 'ver').toLowerCase();
    const result = await run({
      guild: message.guild, member: message.member, sub, attachment: message.attachments.first() || null,
      name: sub === 'subir' ? args[1] : null, emojiText: args[1]
    });
    return message.reply(result);
  }
};

