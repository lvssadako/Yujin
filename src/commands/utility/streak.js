const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  FLAME_TIERS,
  getUserStreakStatus,
  setGlobalStreakCustomization,
  setStreakAlertPreference,
  getStreakLeaderboard
} = require('../../services/streak/streakService');
const { generateStreakCard } = require('../../services/streak/streakCard');
const { buildStreakCustomizationPanel } = require('../../services/streak/streakCustomizer');
const { STREAK_TEMPLATES } = require('../../constants/streakThemes');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');
const { readLevels, ensureUserData } = require('../../services/level').levelService;
const { readProfiles, ensureUser } = require('../../utils/profileStore');

function canUseCustomStreakUrl(member, userLevelData, userStreak) {
  const boosterRole = member.guild?.roles?.premiumSubscriberRole;
  const isBooster = Boolean(member.premiumSince) || (boosterRole && member.roles?.cache?.has(boosterRole.id));
  const hasLevel = (userLevelData?.level || 0) >= 5;
  const hasStreak = (userStreak || 0) >= 7;
  return isBooster || hasLevel || hasStreak;
}

function buildLeaderboardEmbed(guild, lb) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = lb.top.map((u, i) => {
    const medal = medals[i] || `**#${i + 1}**`;
    const statusIcon = u.isActiveToday ? '🟢' : '⏳';
    return `${medal} <@${u.userId}> — ${u.tier.emoji} **${u.streakDays} días** (${u.tier.name}) ${statusIcon}`;
  });

  return new EmbedBuilder()
    .setAuthor({ name: `🏆 Tabla de Rachas — ${guild.name}`, iconURL: guild.iconURL({ dynamic: true }) })
    .setColor(0xF1C40F)
    .setDescription(
      lines.length > 0
        ? lines.join('\n\n')
        : '*No hay rachas activas en este momento. ¡Sé el primero en chatear!*'
    )
    .addFields({
      name: '📈 Estadísticas del Servidor',
      value: `> 👥 **Usuarios con racha activa:** ${lb.totalActive}\n> 🔥 **Mayor racha actual:** ${lb.highestStreak} días\n> 🟢 = *Ya escribió hoy* · ⏳ = *Pendiente de escribir hoy*`,
      inline: false
    })
    .setFooter({ text: 'Escribe todos los días en el servidor para escalar el ranking' })
    .setTimestamp();
}

function buildTiersEmbed() {
  const lines = FLAME_TIERS.map(t => {
    const bonusXp = Math.round((t.xpMultiplier - 1) * 100);
    const perks = [];
    if (bonusXp > 0) perks.push(`+${bonusXp}% XP Extra`);
    if (t.shopDiscount > 0) perks.push(`${t.shopDiscount}% Descuento Tienda`);
    if (t.rewardCoins > 0) perks.push(`🎁 Recompensa: ${t.rewardCoins.toLocaleString()} 🪙`);
    if (t.badge) perks.push(`Insignia: ${t.badge}`);
    const perksText = perks.length > 0 ? perks.join(' · ') : 'Reconocimiento inicial';

    return `${t.emoji} **${t.name}** (Desde ${t.minDays} días)\n> ╰ *${perksText}*`;
  });

  return new EmbedBuilder()
    .setAuthor({ name: '🔥 Niveles de Fuego y Recompensas de Racha' })
    .setColor(0xE67E22)
    .setDescription(
      'Tu racha aumenta automáticamente cada día que **envías al menos un mensaje** en el servidor.\n\n' +
      lines.join('\n\n')
    )
    .addFields({
      name: '🧊 ¿Cómo proteger tu racha?',
      value: '> Compra un **🧊 Congelador de Racha** en `/buy` por 3,500 🪙 para salvar tu racha automáticamente si olvidas chatear un día.',
      inline: false
    })
    .setFooter({ text: 'El contador se reinicia a medianoche si no envías ningún mensaje.' })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Sistema de Rachas de Actividad por Chat.')
    .addSubcommand(sub =>
      sub.setName('ver')
        .setDescription('Muestra tu tarjeta visual de racha o la de otro usuario')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a consultar').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('customizar')
        .setDescription('Personaliza globalmente tu tarjeta de racha (Fondos, temas y colores)')
        .addStringOption(opt =>
          opt.setName('plantilla')
            .setDescription('Elige una plantilla temática de fondo')
            .setRequired(false)
            .addChoices(
              { name: '🔥 Fuego Infernal', value: 'inferno' },
              { name: '⚡ Cyberpunk Neon', value: 'cyberpunk' },
              { name: '🌌 Aurora Boreal', value: 'aurora' },
              { name: '🔮 Galaxia Cósmica', value: 'cosmic' },
              { name: '👑 Fénix Dorado', value: 'phoenix_gold' },
              { name: '🖤 Obsidiana Minimal', value: 'dark_obsidian' },
              { name: '🌸 Sakura Flame', value: 'sakura_blaze' },
              { name: '❌ Quitar Fondo', value: 'none' }
            )
        )
        .addStringOption(opt => opt.setName('fondo_url').setDescription('URL de imagen de fondo personalizada').setRequired(false))
        .addStringOption(opt => opt.setName('color_hex').setDescription('Color de acento/llama (#RRGGBB)').setRequired(false))
        .addIntegerOption(opt => opt.setName('opacidad').setDescription('Opacidad del fondo (10-100%)').setRequired(false).setMinValue(10).setMaxValue(100))
    )
    .addSubcommand(sub =>
      sub.setName('top')
        .setDescription('Muestra el Top de las rachas más largas del servidor')
    )
    .addSubcommand(sub =>
      sub.setName('niveles')
        .setDescription('Muestra los niveles de fuego y beneficios desbloqueables')
    )
    .addSubcommand(sub =>
      sub.setName('alertas')
        .setDescription('Activa o desactiva las alertas por DM antes de perder tu racha')
        .addStringOption(opt =>
          opt.setName('estado')
            .setDescription('Activar o Desactivar')
            .setRequired(true)
            .addChoices(
              { name: '🔔 Activar recordatorios por DM', value: 'on' },
              { name: '🔕 Desactivar recordatorios por DM', value: 'off' }
            )
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand() || 'ver';
    const guild = interaction.guild;

    if (sub === 'ver') {
      await interaction.deferReply();
      const target = interaction.options.getUser('usuario') || interaction.user;
      const status = getUserStreakStatus(guild.id, target.id);
      const botName = interaction.guild?.members?.me?.displayName || interaction.client?.user?.username || 'Bot';
      const attachment = await generateStreakCard(target, status, botName);

      const isSelf = target.id === interaction.user.id;
      const components = [];
      if (isSelf) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('streak_open_customizer')
              .setLabel('Personalizar Tarjeta')
              .setEmoji('🎨')
              .setStyle(ButtonStyle.Primary)
          )
        );
      }

      return interaction.editReply({ files: [attachment], components });
    }

    if (sub === 'customizar') {
      const hasOptions = ['plantilla', 'fondo_url', 'color_hex', 'opacidad'].some(
        opt => interaction.options.get(opt) !== null
      );

      if (!hasOptions) {
        const panel = buildStreakCustomizationPanel(guild.id, interaction.user.id, interaction.member);
        return interaction.reply({ embeds: [panel.embed], components: panel.components, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const template = interaction.options.getString('plantilla');
      const bgUrl = interaction.options.getString('fondo_url');
      const hex = interaction.options.getString('color_hex');
      const opacity = interaction.options.getInteger('opacidad');

      const updates = {};
      const changes = [];

      if (template) {
        updates.streakTemplate = template;
        if (template === 'none') {
          updates.streakBgUrl = '';
          updates.streakAccent = '';
          changes.push('🖼️ **Plantilla:** Fondo base oscuro restablecido');
        } else if (STREAK_TEMPLATES[template]) {
          if (!hex) {
            updates.streakAccent = STREAK_TEMPLATES[template].accent;
          }
          changes.push(`🖼️ **Plantilla y Tema:** ${STREAK_TEMPLATES[template].name}`);
        }
      }

      if (bgUrl) {
        const profiles = readProfiles();
        const u = ensureUser(profiles, guild.id, interaction.user.id);
        const levels = readLevels();
        const lvlData = ensureUserData(levels, guild.id, interaction.user.id);

        if (!canUseCustomStreakUrl(interaction.member, lvlData, u.streakDays)) {
          return interaction.editReply('🔒 **Acceso Bloqueado:** Los fondos por URL personalizada requieren ser **Booster**, tener **Nivel 5+** o una **Racha de 7+ días**.');
        }

        const validated = normalizeExternalImageUrl(bgUrl);
        if (!validated) {
          return interaction.editReply('❌ La URL ingresada no es válida o segura. Sube tu imagen a sitios públicos como Catbox o Discord.');
        }

        updates.streakBgUrl = validated;
        updates.streakTemplate = 'custom';
        changes.push('🔗 **Fondo URL:** Actualizado');
      }

      if (hex) {
        if (/^#?[0-9a-f]{6}$/i.test(hex)) {
          updates.streakAccent = hex.startsWith('#') ? hex : '#' + hex;
          changes.push(`🎨 **Color Acento:** \`${updates.streakAccent}\``);
        } else {
          return interaction.editReply('❌ Formato de color hexadecimal inválido. Usa formato `#RRGGBB` (ej: `#FF4500`).');
        }
      }

      if (opacity !== null) {
        updates.streakBgOpacity = opacity / 100;
        changes.push(`👁️ **Opacidad:** ${opacity}%`);
      }

      setGlobalStreakCustomization(interaction.user.id, updates);

      const embed = new EmbedBuilder()
        .setAuthor({ name: '✅ Tarjeta de Racha Actualizada Globalmente' })
        .setColor(updates.streakAccent || '#57F287')
        .setDescription(`Tus preferencias globales han sido guardadas:\n\n${changes.join('\n')}\n\n*Usa \`/streak\` para ver tu nueva tarjeta.*`)
        .setFooter({ text: 'Los cambios se reflejarán en todos los servidores' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'top') {
      const lb = getStreakLeaderboard(guild.id, 10);
      const embed = buildLeaderboardEmbed(guild, lb);
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'niveles') {
      const embed = buildTiersEmbed();
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'alertas') {
      const estado = interaction.options.getString('estado');
      const disabled = estado === 'off';
      setStreakAlertPreference(guild.id, interaction.user.id, disabled);
      return interaction.reply({
        content: disabled
          ? '🔕 **Alertas desactivadas.** Ya no recibirás DMs de recordatorio de racha.'
          : '🔔 **Alertas activadas.** Te avisaremos por DM 3 horas antes de medianoche si estás por perder tu racha.',
        ephemeral: true
      });
    }
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('❌ Este comando solo puede usarse en servidores.');

    const sub = (args[0] || '').toLowerCase();
    const guild = message.guild;

    if (sub === 'top' || sub === 'leaderboard') {
      const lb = getStreakLeaderboard(guild.id, 10);
      const embed = buildLeaderboardEmbed(guild, lb);
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'niveles' || sub === 'tiers' || sub === 'info') {
      const embed = buildTiersEmbed();
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'alertas' || sub === 'alerts') {
      const option = (args[1] || '').toLowerCase();
      const disabled = ['off', 'desactivar', 'no'].includes(option);
      setStreakAlertPreference(guild.id, message.author.id, disabled);
      return message.reply(
        disabled
          ? '🔕 **Alertas desactivadas.** Ya no recibirás DMs de recordatorio de racha.'
          : '🔔 **Alertas activadas.** Te avisaremos por DM si estás por perder tu racha.'
      );
    }

    if (sub === 'customizar' || sub === 'customize' || sub === 'set') {
      const panel = buildStreakCustomizationPanel(guild.id, message.author.id, message.member);
      return message.reply({ embeds: [panel.embed], components: panel.components });
    }

    let target = message.author;
    if (message.mentions.users.size > 0) {
      target = message.mentions.users.first();
    } else if (args[0] && !['ver', 'me', 'card'].includes(sub)) {
      const parsedId = args[0].replace(/[<@!>]/g, '');
      const fetched = await guild.members.fetch(parsedId).catch(() => null);
      if (fetched) target = fetched.user;
    }

    const status = getUserStreakStatus(guild.id, target.id);
    const botName = message.guild?.members?.me?.displayName || message.client?.user?.username || 'Bot';
    const attachment = await generateStreakCard(target, status, botName);

    const isSelf = target.id === message.author.id;
    const components = [];
    if (isSelf) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('streak_open_customizer')
            .setLabel('Personalizar Tarjeta')
            .setEmoji('🎨')
            .setStyle(ButtonStyle.Primary)
        )
      );
    }

    return message.reply({ files: [attachment], components });
  },

  buildLeaderboardEmbed,
  buildTiersEmbed
};
