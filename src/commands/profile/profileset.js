const { createEmbed } = require('../../utils/ui');
const logger = require('../../utils/logger');
const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');
const { THEME_PRESETS, WALLPAPER_PRESETS } = require('../../constants/profileThemes');
const { getProfileBackgroundService, lockedMessage } = require('../../services/profile/profileBackgroundService');
const { REQUIRED_STREAK_DAYS } = require('../../services/profile/backgroundAccess');

function buildCustomizationPanel(guildId, userId, member) {
  const profiles = readProfiles();
  const user = ensureUser(profiles, guildId, userId);
  const access = getProfileBackgroundService().getAccess(member);
  const isUnlocked = access.allowed;
  const serverName = member?.displayName || member?.user?.displayName || member?.user?.username || 'Usuario';

  const embed = createEmbed()
    .setAuthor({ name: `🎨 Estudio de Personalización de Perfil: ${serverName}`, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setColor(user.accent || '#E94560')
    .setDescription('Personaliza cada aspecto de tu tarjeta de perfil visual en tiempo real usando los controles abajo.')
    .addFields(
      {
        name: '🏷️ Título / Lema',
        value: user.title ? `> **"${user.title}"**` : '> *Sin título configurado.*',
        inline: true
      },
      {
        name: '🎨 Color de Acento',
        value: `> **\`${user.accent || '#E94560'}\`**`,
        inline: true
      },
      {
        name: '📊 Color de Barra',
        value: user.barColor ? `> **\`${user.barColor}\`**` : '> *Igual al color de acento*',
        inline: true
      },
      {
        name: '🏅 Insignia Destacada',
        value: user.featuredBadge ? `> \`${user.featuredBadge}\`` : '> *Ninguna*',
        inline: true
      },
      {
        name: '🖼️ Fondo Actual',
        value: user.bgUrl ? `> [Ver Fondo](${user.bgUrl}) · Opacidad: **${Math.round((user.bgOpacity || 0.7) * 100)}%**` : '> *Fondo oscuro por defecto*',
        inline: false
      },
      {
        name: '🔓 Estado de Desbloqueo (Fondo URL)',
        value: isUnlocked
          ? `✅ **Desbloqueado** (${{ booster: 'Eres Booster', streak: `Racha de ${REQUIRED_STREAK_DAYS}+ días`, pass: 'Pase de Fondo comprado' }[access.reason]})`
          : `🔒 **Bloqueado** (Booster, racha de ${REQUIRED_STREAK_DAYS}+ días o Pase de Fondo: \`/fondo comprar\`)`,
        inline: false
      }
    )
    .setFooter({ text: 'Selecciona una opción en los menús para cambiar tu estética' })
    .setTimestamp();

  // Menú selector de temas
  const themeOptions = Object.entries(THEME_PRESETS).map(([id, t]) => ({
    label: t.name,
    description: t.description,
    value: `theme_${id}`,
    default: user.accent?.toLowerCase() === t.color.toLowerCase()
  }));

  const themeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('profile_select_theme')
      .setPlaceholder('🎨 Elegir una paleta de color temática...')
      .addOptions(themeOptions)
  );

  // Menú selector de fondos predefinidos
  const bgOptions = [
    { label: '⬛ Fondo Oscuro por Defecto', description: 'Sin imagen de fondo', value: 'bg_preset_none' },
    ...Object.entries(WALLPAPER_PRESETS).map(([id, w]) => ({
      label: w.name,
      description: 'Wallpaper predefinido de alta calidad',
      value: `bg_preset_${id}`,
      default: user.bgUrl === w.url
    }))
  ];

  const bgRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('profile_select_bg')
      .setPlaceholder('🖼️ Elegir un wallpaper predefinido...')
      .addOptions(bgOptions)
  );

  // Botones de acción (5 botones máximo por ActionRow)
  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('profile_btn_title')
      .setLabel('Título')
      .setEmoji('🏷️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('profile_btn_hex')
      .setLabel('Color Hex')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('profile_btn_bar_color')
      .setLabel('Color Barra')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('profile_btn_custom_bg')
      .setLabel('Fondo URL')
      .setEmoji('🔗')
      .setStyle(isUnlocked ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('profile_btn_opacity')
      .setLabel('Opacidad')
      .setEmoji('👁️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [themeRow, bgRow, btnRow] };
}

module.exports = {
  name: 'profileset',
  description: 'Personaliza tu tarjeta de perfil interactiva',
  data: new SlashCommandBuilder()
    .setName('profileset')
    .setDescription('Personaliza tu tarjeta de perfil (Título, colores, fondos)')
    .addStringOption(o => o.setName('titulo').setDescription('Título bajo tu nombre').setRequired(false).setMaxLength(32))
    .addStringOption(o =>
      o.setName('tema')
        .setDescription('Elige una paleta de color predefinida')
        .setRequired(false)
        .addChoices(
          { name: '⚡ Ciberpunk Cyan', value: 'cyberpunk' },
          { name: '🔥 Fuego Infernal', value: 'crimson' },
          { name: '👑 Fénix Dorado', value: 'royal_gold' },
          { name: '🖤 Obsidiana Minimal', value: 'dark_minimal' },
          { name: '💜 Neón Violeta', value: 'purple_neon' },
          { name: '🌿 Esmeralda', value: 'emerald' },
          { name: '🌸 Sakura Rosa', value: 'cherry_blossom' },
          { name: '📟 Matrix Code', value: 'matrix' }
        )
    )
    .addStringOption(o => o.setName('color_hex').setDescription('Color acento personalizado (ej: #00ffaa)').setRequired(false))
    .addStringOption(o => o.setName('color_barra').setDescription('Color de barra de progreso (ej: #00ffaa, o "default")').setRequired(false))
    .addStringOption(o =>
      o.setName('fondo_preset')
        .setDescription('Elige un wallpaper predefinido')
        .setRequired(false)
        .addChoices(
          { name: '🔥 Fuego Infernal', value: 'inferno' },
          { name: '👑 Fénix Dorado', value: 'phoenix_gold' },
          { name: '🖤 Obsidiana Minimal', value: 'dark_obsidian' },
          { name: '🌆 Synthwave Sunset', value: 'synthwave' },
          { name: '🌌 Nebulosa Cósmica', value: 'galaxy' },
          { name: '🏙️ Cyberpunk City', value: 'cybercity' },
          { name: '🌸 Noche de Sakura', value: 'sakura_night' },
          { name: '❌ Quitar Fondo', value: 'none' }
        )
    )
    .addStringOption(o => o.setName('fondo_url').setDescription('URL de tu propia imagen de fondo').setRequired(false))
    .addIntegerOption(o => o.setName('opacidad').setDescription('Opacidad del fondo (10-100%)').setRequired(false).setMinValue(10).setMaxValue(100)),

  async execute(interaction) {
    // Si no se pasaron opciones, abrir el panel interactivo visual
    const hasOptions = ['titulo', 'tema', 'color_hex', 'color_barra', 'fondo_preset', 'fondo_url', 'opacidad'].some(
      opt => interaction.options.get(opt) !== null
    );

    if (!hasOptions) {
      const panel = buildCustomizationPanel(interaction.guildId, interaction.user.id, interaction.member);
      return interaction.reply({ embeds: [panel.embed], components: panel.components, ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const profiles = readProfiles();
    const user = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const bgService = getProfileBackgroundService();

    const title = interaction.options.getString('titulo');
    const theme = interaction.options.getString('tema');
    const hex = interaction.options.getString('color_hex');
    const barColorOption = interaction.options.getString('color_barra');
    const bgPreset = interaction.options.getString('fondo_preset');
    let bgUrl = interaction.options.getString('fondo_url');
    const opacity = interaction.options.getInteger('opacidad');

    const changes = [];

    // Validar el fondo por URL (formato y acceso) antes de guardar cualquier cambio.
    if (bgUrl && !bgPreset) {
      const checked = bgService.validateUrl(bgUrl);
      if (!checked.ok) return interaction.editReply(`❌ ${checked.error}`);
      if (!bgService.getAccess(interaction.member).allowed) return interaction.editReply(lockedMessage());
    }

    if (title !== null) {
      user.title = title || '';
      changes.push(`🏷️ **Título:** "${user.title || 'Ninguno'}"`);
    }

    if (theme && THEME_PRESETS[theme]) {
      user.accent = THEME_PRESETS[theme].color;
      changes.push(`🎨 **Tema:** ${THEME_PRESETS[theme].name}`);
    } else if (hex) {
      if (/^#?[0-9a-f]{6}$/i.test(hex)) {
        user.accent = hex.startsWith('#') ? hex : '#' + hex;
        changes.push(`🎨 **Color Hex:** \`${user.accent}\``);
      } else {
        return interaction.editReply('❌ Formato de color hexadecimal inválido. Usa formato `#RRGGBB` (ej: `#00ffcc`).');
      }
    }

    if (barColorOption !== null) {
      const lower = barColorOption.trim().toLowerCase();
      if (lower === 'default' || lower === 'none' || lower === 'reset' || lower === '') {
        user.barColor = '';
        changes.push('📊 **Color de Barra:** Restablecido a color de acento.');
      } else if (/^#?[0-9a-f]{6}$/i.test(barColorOption.trim())) {
        const cleanBarHex = barColorOption.trim().startsWith('#') ? barColorOption.trim() : '#' + barColorOption.trim();
        user.barColor = cleanBarHex;
        changes.push(`📊 **Color de Barra:** \`${cleanBarHex}\``);
      } else {
        return interaction.editReply('❌ Formato de color de barra inválido. Usa formato `#RRGGBB` (ej: `#00ffcc`) o `default`.');
      }
    }

    if (opacity !== null) {
      user.bgOpacity = opacity / 100;
      changes.push(`👁️ **Opacidad:** ${opacity}%`);
    }

    writeProfiles(profiles);

    // El servicio de fondos lee y escribe el perfil por su cuenta: se ejecuta tras el guardado anterior.
    if (bgPreset) {
      const result = await bgService.setPreset(interaction.guildId, interaction.user.id, bgPreset);
      changes.push(result.ok
        ? (result.name ? `🖼️ **Fondo:** ${result.name}` : '🖼️ **Fondo:** Eliminado (Fondo oscuro por defecto).')
        : `⚠️ **Fondo:** ${result.error}`);
    } else if (bgUrl) {
      const result = await bgService.setCustomUrl(interaction.member, bgUrl);
      changes.push(result.ok
        ? `🖼️ **Fondo URL:** Guardado y verificado con éxito (${Math.round((result.size || 0) / 1024)} KB).`
        : `⚠️ **Fondo URL:** ${result.error}`);
    }

    const freshUser = ensureUser(readProfiles(), interaction.guildId, interaction.user.id);
    const embed = createEmbed()
      .setAuthor({ name: '✅ Perfil Actualizado con Éxito' })
      .setColor(freshUser.accent || '#57F287')
      .setDescription(`Tus preferencias de perfil han sido guardadas:\n\n${changes.join('\n')}`)
      .setFooter({ text: 'Usa /profile para ver tu tarjeta actualizada' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    if (args.length === 0) {
      const panel = buildCustomizationPanel(message.guild.id, message.author.id, message.member);
      return message.reply({ embeds: [panel.embed], components: panel.components });
    }

    const sub = (args[0] || '').toLowerCase();
    const profiles = readProfiles();
    const user = ensureUser(profiles, message.guild.id, message.author.id);
    const bgService = getProfileBackgroundService();

    if (sub === 'titulo' || sub === 'title') {
      const title = args.slice(1).join(' ').slice(0, 32);
      user.title = title;
      writeProfiles(profiles);
      return message.reply(`✅ Título actualizado: "${title || 'Ninguno'}"`);
    } else if (sub === 'hex' || sub === 'color') {
      const hex = args[1];
      if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return message.reply('❌ Formato inválido. Usa: `&profileset hex #ff6b81`');
      user.accent = hex.startsWith('#') ? hex : '#' + hex;
      writeProfiles(profiles);
      return message.reply(`✅ Color de acento actualizado a \`${user.accent}\``);
    } else if (sub === 'bar' || sub === 'barra') {
      const barColor = args[1];
      if (!barColor || (barColor !== 'default' && !/^#?[0-9a-f]{6}$/i.test(barColor))) {
        return message.reply('❌ Formato inválido. Usa: `&profileset bar #4ecdc4` o `&profileset bar default`');
      }
      user.barColor = barColor === 'default' ? '' : (barColor.startsWith('#') ? barColor : '#' + barColor);
      writeProfiles(profiles);
      return message.reply(`✅ Color de barra actualizado a \`${user.barColor || 'default'}\``);
    } else if (sub === 'fondo' || sub === 'bg') {
      const target = args[1];
      if (!target || target === 'none' || target === 'quitar') {
        await bgService.setPreset(message.guild.id, message.author.id, 'none');
        return message.reply('✅ Fondo eliminado (restablecido a oscuro por defecto).');
      }
      if (Object.prototype.hasOwnProperty.call(WALLPAPER_PRESETS, target)) {
        const preset = await bgService.setPreset(message.guild.id, message.author.id, target);
        return message.reply(preset.ok ? `✅ Fondo cambiado a ${preset.name}.` : `❌ ${preset.error}`);
      }
      const result = await bgService.setCustomUrl(message.member, target);
      if (!result.ok) return message.reply(result.code === 'locked' ? result.error : `❌ ${result.error}`);
      return message.reply('✅ Fondo guardado y verificado con éxito.');
    } else {
      const panel = buildCustomizationPanel(message.guild.id, message.author.id, message.member);
      return message.reply({ embeds: [panel.embed], components: panel.components });
    }
  },

  buildCustomizationPanel
};