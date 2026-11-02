const { createEmbed } = require('../../utils/ui');
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
  FLAME_TIERS,
  getUserStreakStatus,
  setGlobalStreakCustomization,
  setStreakAlertPreference,
  getStreakLeaderboard,
  setUserStreakTimezone,
  STREAK_ACTIVATION_DAYS
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
  const lines = lb.top.map((user, index) => (medals[index] || '**' + (index + 1) + '.**') + ' <@' + user.userId + '> · **' + user.streakDays + ' días**\n' + user.tier.name + ' · ' + (user.isActiveToday ? 'Actividad de hoy registrada' : 'Pendiente de escribir hoy'));
  return createEmbed().setAuthor({ name: 'Yujin · Rachas' }).setTitle('La constancia tiene su lugar')
    .setDescription(lines.join('\n\n') || 'Todavía no hay rachas activas. Envía un mensaje para comenzar la tuya.')
    .addFields({ name: 'Rachas activas', value: String(lb.totalActive), inline: true }, { name: 'Mayor racha actual', value: lb.highestStreak + ' días', inline: true })
    .setFooter({ text: 'Cada persona tiene su propio día según su zona horaria · Configúrala con /streak zona' });
}
function buildTiersEmbed() {
  const embed = createEmbed().setAuthor({ name: 'Yujin · Rachas' }).setTitle('Cada día cuenta')
    .setDescription('Envía al menos un mensaje cada día para mantener tu racha de actividad. El día cambia a medianoche en tu zona horaria.\n' +
      `Se **activa** al llegar a **${STREAK_ACTIVATION_DAYS} días seguidos**; antes de eso no otorga beneficios ni recompensas.`);
  for (const tier of FLAME_TIERS) {
    const perks = [];
    const bonusXp = Math.round((tier.xpMultiplier - 1) * 100);
    if (bonusXp > 0) perks.push('+' + bonusXp + '% XP');
    if (tier.shopDiscount > 0) perks.push(tier.shopDiscount + '% de descuento');
    if (tier.rewardCoins > 0) perks.push(tier.rewardCoins.toLocaleString('es-MX') + ' monedas al alcanzar el hito');
    if (tier.badge) perks.push('Insignia: ' + tier.badge);
    embed.addFields({ name: tier.name + ' · Desde ' + tier.minDays + ' días', value: perks.join(' · ') || 'Tu primer paso hacia una nueva racha.', inline: false });
  }
  return embed.setFooter({ text: 'Un congelador protege un día sin actividad · Consulta los objetos en /buy' });
}

const POPULAR_ZONES = [
  ['Ciudad de México', 'America/Mexico_City'], ['Tijuana', 'America/Tijuana'],
  ['Bogotá', 'America/Bogota'], ['Lima', 'America/Lima'], ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
  ['Santiago', 'America/Santiago'], ['Caracas', 'America/Caracas'], ['Madrid', 'Europe/Madrid'],
  ['Nueva York', 'America/New_York'], ['Los Ángeles', 'America/Los_Angeles'], ['UTC', 'UTC']
];
const searchText = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').toLowerCase();
function timezoneMessage(status) {
  return '**Zona de tu racha: ' + status.timeZone + '**' +
    (status.timezoneConfigured === false ? ' (por defecto)' : '') +
    '\nEl día cambia a las **12:00 a. m.** en esa zona. Próximo cambio: <t:' + status.midnightTs + ':R>.' +
    '\nElige tu ciudad con /streak zona o &streak zona America/Mexico_City. Puedes cambiarla una vez cada 24 horas.';
}
function chooseTimezone(guildId, userId, input) {
  try {
    const result = input ? setUserStreakTimezone(userId, input) : getUserStreakStatus(guildId, userId);
    return timezoneMessage(result);
  } catch (error) {
    if (/Zona horaria inválida|una vez cada 24 horas|Usuario inválido/.test(error.message)) return '❌ ' + error.message;
    throw error;
  }
}

function buildFormingStreakNotice(status, isSelf) {
  if (!status || status.isActive || status.streakDisabled) return undefined;
  const remaining = status.daysToActivation;
  const who = isSelf ? 'Tu racha' : 'Esta racha';
  return `🕯️ ${who} está en formación: se activa al llegar a **${STREAK_ACTIVATION_DAYS} días seguidos** ` +
    `(faltan **${remaining} día${remaining === 1 ? '' : 's'}**). Hasta entonces no otorga beneficios ni recompensas.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Consulta y personaliza tu racha de actividad y tu zona horaria.')
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
    )
    .addSubcommand(sub => sub.setName('zona')
      .setDescription('Consulta o elige la zona horaria para tu racha')
      .addStringOption(opt => opt.setName('nombre').setDescription('Ciudad o zona, por ejemplo America/Mexico_City')
        .setRequired(false).setAutocomplete(true).setMaxLength(100))),

  async autocomplete(interaction) {
    const query = searchText(interaction.options.getFocused() || '');
    const zones = POPULAR_ZONES.concat(Intl.supportedValuesOf('timeZone').map(zone => [zone, zone]));
    const seen = new Set();
    const matches = zones.filter(([name, value]) => {
      if (seen.has(value) || !searchText(name + ' ' + value).includes(query)) return false;
      seen.add(value); return true;
    }).slice(0, 25).map(([name, value]) => ({ name: (name === value ? value : name + ' · ' + value).slice(0, 100), value }));
    return interaction.respond(matches);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand() || 'ver';
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ content: '❌ Este comando solo puede usarse en servidores.', ephemeral: true });
    if (sub === 'zona') return interaction.reply({ content: chooseTimezone(guild.id, interaction.user.id, interaction.options.getString('nombre')), ephemeral: true });

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
              .setLabel('Personalizar tarjeta')
              .setEmoji('🎨')
              .setStyle(ButtonStyle.Primary)
          )
        );
      }

      return interaction.editReply({ content: [buildFormingStreakNotice(status, isSelf), timezoneMessage(status)].filter(Boolean).join('\n\n'), files: [attachment], components });
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

      const embed = createEmbed()
        .setAuthor({ name: '✅ Tarjeta de Racha Actualizada Globalmente' })
        .setColor(updates.streakAccent || '#57F287')
        .setDescription(`Tus preferencias globales han sido guardadas:\n\n${changes.join('\n')}\n\n*Usa \`/streak\` para ver tu nueva tarjeta.*`)
        .setFooter({ text: 'Los cambios se reflejarán en todos los servidores' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'top') {
      const lb = getStreakLeaderboard(guild.id, 10, guild);
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
    if (['zona', 'timezone', 'horario'].includes(sub)) return message.reply(chooseTimezone(guild.id, message.author.id, args.slice(1).join(' ')));

    if (sub === 'top' || sub === 'leaderboard') {
      const lb = getStreakLeaderboard(guild.id, 10, guild);
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
            .setLabel('Personalizar tarjeta')
            .setEmoji('🎨')
            .setStyle(ButtonStyle.Primary)
        )
      );
    }

    return message.reply({ content: [buildFormingStreakNotice(status, isSelf), timezoneMessage(status)].filter(Boolean).join('\n\n'), files: [attachment], components });
  },

  buildLeaderboardEmbed,
  buildTiersEmbed,
  buildFormingStreakNotice
};
