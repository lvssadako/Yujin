const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const { readProfiles, ensureUser, ensureGlobalUser } = require('../../utils/profileStore');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');
const { STREAK_TEMPLATES } = require('../../constants/streakThemes');
const { setGlobalStreakCustomization, getUserStreakStatus } = require('./streakService');
const { readLevels, ensureUserData } = require('../level').levelService;
const logger = require('../../utils/logger');

function canUseCustomStreakUrl(member, userLevelData, userStreak) {
  const boosterRole = member.guild?.roles?.premiumSubscriberRole;
  const isBooster = Boolean(member.premiumSince) || (boosterRole && member.roles?.cache?.has(boosterRole.id));
  const hasLevel = (userLevelData?.level || 0) >= 5;
  const hasStreak = (userStreak || 0) >= 7;
  return isBooster || hasLevel || hasStreak;
}

function buildStreakCustomizationPanel(guildId, userId, member) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, guildId, userId);
  const g = ensureGlobalUser(profiles, userId);
  const levels = readLevels();
  const lvlData = ensureUserData(levels, guildId, userId);

  const isUnlocked = canUseCustomStreakUrl(member, lvlData, u.streakDays);

  let currentBgLabel = '⬛ Gradiente Oscuro por Defecto';
  if (g.streakTemplate && STREAK_TEMPLATES[g.streakTemplate]) {
    currentBgLabel = STREAK_TEMPLATES[g.streakTemplate].name;
  }
  if (g.streakBgUrl && (!g.streakTemplate || g.streakTemplate === 'custom' || !STREAK_TEMPLATES[g.streakTemplate])) {
    currentBgLabel = `[Wallpaper Personalizado](${g.streakBgUrl})`;
  }

  const tpl = g.streakTemplate && STREAK_TEMPLATES[g.streakTemplate];
  const activeColor = g.streakAccent || tpl?.accent || '#FF4500';

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `🔥 Estudio Global de Racha: ${member.user.username}`,
      iconURL: member.user.displayAvatarURL({ dynamic: true })
    })
    .setColor(activeColor)
    .setDescription('Personaliza el aspecto de tu **Tarjeta de Racha**. Tu diseño se guardará de forma **GLOBAL** y se mostrará en todos los servidores donde uses el bot.')
    .addFields(
      {
        name: '🖼️ Fondo / Plantilla Actual',
        value: `> **${currentBgLabel}**\n> Opacidad: **${Math.round(g.streakBgOpacity * 100)}%**`,
        inline: true
      },
      {
        name: '🎨 Color de Acento / Llama',
        value: g.streakAccent ? `> \`${g.streakAccent}\`` : (tpl?.accent ? `> \`${tpl.accent}\` *(Tema: ${tpl.name})*` : '> *Automático según tu Nivel de Fuego*'),
        inline: true
      },
      {
        name: '🌐 Alcance del Perfil',
        value: '> 🌍 **Global** (Activo en todos los servidores)',
        inline: false
      },
      {
        name: '🔓 Estado de Fondos por URL',
        value: isUnlocked
          ? '✅ **Desbloqueado** (Eres Booster o tienes Nivel 5+ / Racha 7+)'
          : '🔒 **Bloqueado** (Usa las plantillas predefinidas o sube a Nivel 5 / Racha 7)',
        inline: false
      }
    )
    .setFooter({ text: 'Selecciona una plantilla o ajusta los parámetros con los botones' })
    .setTimestamp();

  // Selector de plantillas temáticas
  const templateOptions = [
    { label: '⬛ Fondo Oscuro por Defecto', description: 'Sin imagen de fondo', value: 'st_none' },
    ...Object.entries(STREAK_TEMPLATES).map(([id, t]) => ({
      label: t.name,
      description: t.description,
      value: `st_${id}`,
      default: g.streakTemplate === id
    }))
  ];

  const templateRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('streak_select_template')
      .setPlaceholder('🔥 Elegir una plantilla de fondo temática...')
      .addOptions(templateOptions)
  );

  // Botones de personalización
  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('streak_btn_custom_bg')
      .setLabel('Fondo URL')
      .setEmoji('🔗')
      .setStyle(isUnlocked ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('streak_btn_accent')
      .setLabel('Color Acento')
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('streak_btn_opacity')
      .setLabel('Opacidad')
      .setEmoji('👁️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('streak_btn_reset')
      .setLabel('Restablecer')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Danger)
  );

  return { embed, components: [templateRow, btnRow] };
}

async function handleStreakCustomizerInteraction(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const member = interaction.member;

  // 1. Abrir panel de personalización
  if (interaction.isButton() && interaction.customId === 'streak_open_customizer') {
    const panel = buildStreakCustomizationPanel(guildId, userId, member);
    return interaction.reply({ embeds: [panel.embed], components: panel.components, ephemeral: true });
  }

  // 2. Select Menu: Plantilla de fondo y tema
  if (interaction.isStringSelectMenu() && interaction.customId === 'streak_select_template') {
    const selected = interaction.values[0];
    if (selected === 'st_none') {
      setGlobalStreakCustomization(userId, { streakTemplate: 'none', streakBgUrl: '', streakAccent: '' });
    } else {
      const templateKey = selected.replace('st_', '');
      const tpl = STREAK_TEMPLATES[templateKey];
      setGlobalStreakCustomization(userId, {
        streakTemplate: templateKey,
        streakAccent: tpl?.accent || ''
      });
    }
    const panel = buildStreakCustomizationPanel(guildId, userId, member);
    return interaction.update({ embeds: [panel.embed], components: panel.components });
  }

  // 3. Botón: Fondo Custom URL (Modal)
  if (interaction.isButton() && interaction.customId === 'streak_btn_custom_bg') {
    const profiles = readProfiles();
    const u = ensureUser(profiles, guildId, userId);
    const g = ensureGlobalUser(profiles, userId);
    const levels = readLevels();
    const lvlData = ensureUserData(levels, guildId, userId);

    if (!canUseCustomStreakUrl(member, lvlData, u.streakDays)) {
      return interaction.reply({
        content: '🔒 **Acceso Bloqueado:** Los fondos por URL personalizada requieren ser **Booster**, tener **Nivel 5+** o una **Racha de 7+ días**.\n*¡Puedes usar todas las plantillas temáticas predefinidas sin costo!*',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('streak_modal_bg_url')
      .setTitle('🖼️ Fondo Global por URL');

    const input = new TextInputBuilder()
      .setCustomId('streak_url_input')
      .setLabel('Enlace de la imagen (PNG/JPG/WEBP)')
      .setStyle(TextInputStyle.Short)
      .setValue(g.streakBgUrl || '')
      .setPlaceholder('https://files.catbox.moe/tu_imagen.png')
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 4. Botón: Color de acento (Modal)
  if (interaction.isButton() && interaction.customId === 'streak_btn_accent') {
    const profiles = readProfiles();
    const g = ensureGlobalUser(profiles, userId);

    const modal = new ModalBuilder()
      .setCustomId('streak_modal_accent')
      .setTitle('🎨 Color Acento / Llama');

    const input = new TextInputBuilder()
      .setCustomId('streak_accent_input')
      .setLabel('Código Hex (#RRGGBB o vacío para auto)')
      .setStyle(TextInputStyle.Short)
      .setValue(g.streakAccent || '')
      .setMaxLength(7)
      .setPlaceholder('#FF4500 o deja vacío para automático')
      .setRequired(false);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // 5. Botón: Opacidad
  if (interaction.isButton() && interaction.customId === 'streak_btn_opacity') {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('streak_select_opacity')
        .setPlaceholder('👁️ Elige la opacidad del fondo...')
        .addOptions([
          { label: '30% (Tenue / Máxima legibilidad)', value: '0.3' },
          { label: '50% (Equilibrado)', value: '0.5' },
          { label: '65% (Recomendado)', value: '0.65' },
          { label: '80% (Vibrante)', value: '0.8' },
          { label: '100% (Brillo completo)', value: '1.0' }
        ])
    );
    return interaction.reply({ content: 'Selecciona la opacidad del wallpaper para tu tarjeta:', components: [row], ephemeral: true });
  }

  // 6. Select Menu: Opacidad
  if (interaction.isStringSelectMenu() && interaction.customId === 'streak_select_opacity') {
    const val = parseFloat(interaction.values[0]) || 0.65;
    setGlobalStreakCustomization(userId, { streakBgOpacity: val });
    return interaction.update({ content: `✅ Opacidad guardada en **${Math.round(val * 100)}%**. Usa \`/streak\` para ver tu tarjeta.`, components: [] });
  }

  // 7. Botón: Reset
  if (interaction.isButton() && interaction.customId === 'streak_btn_reset') {
    setGlobalStreakCustomization(userId, { streakTemplate: 'none', streakBgUrl: '', streakAccent: '', streakBgOpacity: 0.65 });
    const panel = buildStreakCustomizationPanel(guildId, userId, member);
    return interaction.update({ embeds: [panel.embed], components: panel.components });
  }

  // 8. Modal Submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'streak_modal_bg_url') {
      const url = interaction.fields.getTextInputValue('streak_url_input').trim();

      if (!url) {
        setGlobalStreakCustomization(userId, { streakBgUrl: '', streakTemplate: 'none' });
        const panel = buildStreakCustomizationPanel(guildId, userId, member);
        return interaction.reply({ content: '🖼️ Fondo eliminado. Ahora se usa el diseño base.', embeds: [panel.embed], components: panel.components, ephemeral: true });
      }

      const validated = normalizeExternalImageUrl(url);
      if (!validated) {
        return interaction.reply({ content: '❌ La URL ingresada no es válida o segura.', ephemeral: true });
      }

      setGlobalStreakCustomization(userId, { streakBgUrl: validated, streakTemplate: 'custom' });
      const panel = buildStreakCustomizationPanel(guildId, userId, member);
      return interaction.reply({ content: '✅ Fondo global de racha actualizado con éxito.', embeds: [panel.embed], components: panel.components, ephemeral: true });
    }

    if (interaction.customId === 'streak_modal_accent') {
      const hex = interaction.fields.getTextInputValue('streak_accent_input').trim();

      if (!hex) {
        setGlobalStreakCustomization(userId, { streakAccent: '' });
        const panel = buildStreakCustomizationPanel(guildId, userId, member);
        return interaction.reply({ content: '🎨 Color acento restablecido a automático.', embeds: [panel.embed], components: panel.components, ephemeral: true });
      }

      if (/^#?[0-9a-f]{6}$/i.test(hex)) {
        const cleanHex = hex.startsWith('#') ? hex : '#' + hex;
        setGlobalStreakCustomization(userId, { streakAccent: cleanHex });
        const panel = buildStreakCustomizationPanel(guildId, userId, member);
        return interaction.reply({ content: `✅ Color acento global guardado: **\`${cleanHex}\`**`, embeds: [panel.embed], components: panel.components, ephemeral: true });
      } else {
        return interaction.reply({ content: '❌ Formato hexadecimal no válido (usa formato `#RRGGBB`).', ephemeral: true });
      }
    }
  }

  return false;
}

module.exports = {
  buildStreakCustomizationPanel,
  handleStreakCustomizerInteraction
};
