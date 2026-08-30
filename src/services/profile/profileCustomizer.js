const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
} = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');
const { THEME_PRESETS, WALLPAPER_PRESETS } = require('../../constants/profileThemes');
const { readLevels, ensureUserData } = require('../../services/level').levelService;
const { buildCustomizationPanel } = require('../../commands/profile/profileset');
const logger = require('../../utils/logger');

function canUseCustomUrl(member, userLevelData, userStreak) {
  const boosterRole = member.guild.roles.premiumSubscriberRole;
  const isBooster = Boolean(member.premiumSince) || (boosterRole && member.roles.cache.has(boosterRole.id));
  const hasLevel = (userLevelData?.level || 0) >= 5;
  const hasStreak = (userStreak || 0) >= 7;
  return isBooster || hasLevel || hasStreak;
}

async function handleProfileInteraction(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const member = interaction.member;

  // 1. Abrir panel de personalización
  if (interaction.isButton() && interaction.customId === 'profile_open_customizer') {
    const panel = buildCustomizationPanel(guildId, userId, member);
    return interaction.reply({ embeds: [panel.embed], components: panel.components, ephemeral: true });
  }

  // 2. Select Menu: Tema de color
  if (interaction.isStringSelectMenu() && interaction.customId === 'profile_select_theme') {
    const selected = interaction.values[0].replace('theme_', '');
    const theme = THEME_PRESETS[selected];
    if (theme) {
      const profiles = readProfiles();
      const user = ensureUser(profiles, guildId, userId);
      user.accent = theme.color;
      writeProfiles(profiles);
      const panel = buildCustomizationPanel(guildId, userId, member);
      return interaction.update({ embeds: [panel.embed], components: panel.components });
    }
  }

  // 3. Select Menu: Fondo preset
  if (interaction.isStringSelectMenu() && interaction.customId === 'profile_select_bg') {
    const selected = interaction.values[0];
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);

    if (selected === 'bg_preset_none') {
      user.bgUrl = '';
    } else {
      const presetId = selected.replace('bg_preset_', '');
      const wallpaper = WALLPAPER_PRESETS[presetId];
      if (wallpaper) user.bgUrl = wallpaper.url;
    }

    writeProfiles(profiles);
    const panel = buildCustomizationPanel(guildId, userId, member);
    return interaction.update({ embeds: [panel.embed], components: panel.components });
  }

  // 4. Botón: Título (Modal)
  if (interaction.isButton() && interaction.customId === 'profile_btn_title') {
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);

    const modal = new ModalBuilder()
      .setCustomId('profile_modal_title')
      .setTitle('🏷️ Personalizar Título');

    const input = new TextInputBuilder()
      .setCustomId('title_input')
      .setLabel('Escribe tu título o lema (Máx. 32 car.)')
      .setStyle(TextInputStyle.Short)
      .setValue(user.title || '')
      .setMaxLength(32)
      .setPlaceholder('Ej: ⚔️ Maestro del Chat')
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 5. Botón: Hex Custom (Modal)
  if (interaction.isButton() && interaction.customId === 'profile_btn_hex') {
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);

    const modal = new ModalBuilder()
      .setCustomId('profile_modal_hex')
      .setTitle('🎨 Color Hexadecimal');

    const input = new TextInputBuilder()
      .setCustomId('hex_input')
      .setLabel('Código Hex (#RRGGBB)')
      .setStyle(TextInputStyle.Short)
      .setValue(user.accent || '#E94560')
      .setMaxLength(7)
      .setPlaceholder('Ej: #00FFCC o #FF0055')
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 6. Botón: Fondo Custom URL (Modal)
  if (interaction.isButton() && interaction.customId === 'profile_btn_custom_bg') {
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    const levels = readLevels();
    const lvlData = ensureUserData(levels, guildId, userId);

    if (!canUseCustomUrl(member, lvlData, user.streakDays)) {
      return interaction.reply({
        content: '🔒 **Acceso Bloqueado:** Los fondos por URL personalizada requieren ser **Booster**, tener **Nivel 5+** o una **Racha de 7+ días**.\n*¡Puedes usar los wallpapers de la galería predefinida sin restricciones!*',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('profile_modal_bg_url')
      .setTitle('🖼️ Fondo Personalizado por URL');

    const input = new TextInputBuilder()
      .setCustomId('url_input')
      .setLabel('Enlace directo de la imagen (PNG/JPG/WEBP)')
      .setStyle(TextInputStyle.Short)
      .setValue(user.bgUrl || '')
      .setPlaceholder('https://files.catbox.moe/ejemplo.png')
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 7. Botón: Opacidad
  if (interaction.isButton() && interaction.customId === 'profile_btn_opacity') {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('profile_select_opacity')
        .setPlaceholder('👁️ Elige el nivel de opacidad del fondo...')
        .addOptions([
          { label: '20% (Muy sutil / Fondo tenue)', value: '0.2' },
          { label: '40% (Suave)', value: '0.4' },
          { label: '60% (Equilibrado)', value: '0.6' },
          { label: '70% (Recomendado)', value: '0.7' },
          { label: '90% (Muy visible)', value: '0.9' },
          { label: '100% (Brillo completo)', value: '1.0' }
        ])
    );
    return interaction.reply({ content: 'Selecciona la opacidad deseada:', components: [row], ephemeral: true });
  }

  // 8. Select Menu: Opacidad
  if (interaction.isStringSelectMenu() && interaction.customId === 'profile_select_opacity') {
    const val = parseFloat(interaction.values[0]) || 0.7;
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    user.bgOpacity = val;
    writeProfiles(profiles);
    return interaction.update({ content: `✅ Opacidad guardada en **${Math.round(val * 100)}%**. Usa \`/profile\` para ver tu tarjeta.`, components: [] });
  }

  // 9. Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'profile_modal_title') {
      const newTitle = interaction.fields.getTextInputValue('title_input').trim();
      const profiles = readProfiles();
      const user = ensureUser(profiles, guildId, userId);
      user.title = newTitle;
      writeProfiles(profiles);
      const panel = buildCustomizationPanel(guildId, userId, member);
      return interaction.reply({ content: `✅ Título actualizado a: **"${newTitle || 'Ninguno'}"**`, embeds: [panel.embed], components: panel.components, ephemeral: true });
    }

    if (interaction.customId === 'profile_modal_hex') {
      const hex = interaction.fields.getTextInputValue('hex_input').trim();
      if (/^#?[0-9a-f]{6}$/i.test(hex)) {
        const cleanHex = hex.startsWith('#') ? hex : '#' + hex;
        const profiles = readProfiles();
        const user = ensureUser(profiles, guildId, userId);
        user.accent = cleanHex;
        writeProfiles(profiles);
        const panel = buildCustomizationPanel(guildId, userId, member);
        return interaction.reply({ content: `✅ Color acento actualizado a: **\`${cleanHex}\`**`, embeds: [panel.embed], components: panel.components, ephemeral: true });
      } else {
        return interaction.reply({ content: '❌ Formato hexadecimal no válido (usa ej. `#FF0055`).', ephemeral: true });
      }
    }

    if (interaction.customId === 'profile_modal_bg_url') {
      const url = interaction.fields.getTextInputValue('url_input').trim();
      const profiles = readProfiles();
      const user = ensureUser(profiles, guildId, userId);

      if (!url) {
        user.bgUrl = '';
        writeProfiles(profiles);
        const panel = buildCustomizationPanel(guildId, userId, member);
        return interaction.reply({ content: '🖼️ Fondo eliminado.', embeds: [panel.embed], components: panel.components, ephemeral: true });
      }

      const validated = normalizeExternalImageUrl(url);
      if (!validated) {
        return interaction.reply({ content: '❌ La URL ingresada no es válida o segura.', ephemeral: true });
      }

      user.bgUrl = validated;
      writeProfiles(profiles);
      const panel = buildCustomizationPanel(guildId, userId, member);
      return interaction.reply({ content: '✅ Fondo personalizado guardado con éxito.', embeds: [panel.embed], components: panel.components, ephemeral: true });
    }
  }

  return false;
}

module.exports = {
  handleProfileInteraction
};
