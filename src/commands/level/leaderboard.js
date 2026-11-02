const { BRAND, formatNumber, formatVoiceTime } = require('../../utils/ui');
const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const logger = require('../../utils/logger');
const { levelService } = require('../../services/level');
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { fetchImageBuffer } = require('../../services/image/imageService');
const { initFonts, FONT_FALLBACKS } = require('../../utils/canvasFontLoader');

initFonts();

const THEME = {
  panel: '#15131D',
  card: '#211E2B',
  cardAlt: '#252132',
  accentA: '#A78BFA',
  accentB: '#C4B5FD',
  text: '#F5F3FF',
  textDim: '#B4ADCA',
  rankColors: ['#E9C46A', '#CDD3E1', '#D9A68C'] // Gold, Silver, Bronze
};

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function fetchAvatarBuffer(url) {
  return fetchImageBuffer(url, { timeoutMs: 6000 });
}

async function drawCircularAvatar(ctx, buffer, x, y, size, borderColor, name = '') {
  try {
    if (!buffer) throw new Error('no buffer');
    const img = await loadImage(buffer);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 3, 0, Math.PI * 2);
    ctx.fillStyle = borderColor || THEME.accentA;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    ctx.save();
    ctx.fillStyle = '#4E5058';
    roundRect(ctx, x, y, size, size, 12);
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.font = 'bold 30px ' + FONT_FALLBACKS;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = String(name).match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase() || '?';
    ctx.fillText(initial, x + size / 2, y + size / 2);
    ctx.restore();
  }
}

function getTimeframeTitle(timeframe) {
  return { daily: 'Hoy', weekly: 'Esta semana', global: 'Histórico' }[timeframe] || 'Histórico';
}
function getCategorySubtitle(category, timeframe = 'global') {
  if (category === 'text') return 'Mensajes enviados';
  if (category === 'voice') return 'Tiempo en llamada';
  return timeframe === 'global' ? 'Nivel y XP acumulado' : 'XP ganado en el período';
}
function fitCanvasText(ctx, text, width) {
  const original = String(text || '');
  let value = original;
  while (value.length && ctx.measureText(value + (value === original ? '' : '…')).width > width) value = value.slice(0, -1);
  return value + (value === original ? '' : '…');
}

async function renderLeaderboardCanvas(guild, leaderboardEntries, timeframe, category, client) {
  const filteredEntries = (leaderboardEntries || []).filter(e => {
    if (guild) {
      const member = guild.members?.cache?.get(e.id);
      const user = (client || guild.client)?.users?.cache?.get(e.id) || member?.user;
      if (user?.bot) return false;
    }
    return true;
  });

  const width = 1200;
  const rowH = 100;
  const headerH = 174;
  const gap = 14;
  const count = Math.max(1, filteredEntries.length);
  const height = headerH + count * (rowH + gap) + 40;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background panel
  ctx.fillStyle = THEME.panel;
  roundRect(ctx, 0, 0, width, height, 20);
  ctx.fill();

  // Header background highlight
  const headGrad = ctx.createLinearGradient(0, 0, width, 0);
  headGrad.addColorStop(0, 'rgba(88, 101, 242, 0.25)');
  headGrad.addColorStop(1, 'rgba(235, 69, 158, 0.15)');
  ctx.fillStyle = headGrad;
  roundRect(ctx, 20, 20, width - 40, headerH - 30, 16);
  ctx.fill();

  ctx.fillStyle = THEME.accentA;
  ctx.fillRect(45, 27, 46, 4);
  ctx.fillStyle = THEME.text;
  ctx.font = 'bold 36px ' + FONT_FALLBACKS;
  ctx.fillText('Ranking de la comunidad', 45, 73);
  ctx.font = '22px ' + FONT_FALLBACKS;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(fitCanvasText(ctx, guild.name || 'Servidor', 760), 45, 110);
  ctx.fillStyle = THEME.accentB;
  ctx.font = '20px ' + FONT_FALLBACKS;
  ctx.fillText(getTimeframeTitle(timeframe) + ' · ' + getCategorySubtitle(category, timeframe), 45, 145);
  ctx.textAlign = 'right';
  ctx.font = 'bold 16px ' + FONT_FALLBACKS;
  ctx.fillStyle = THEME.textDim;
  ctx.fillText(BRAND.name, width - 136, 65);
  ctx.font = '18px ' + FONT_FALLBACKS;
  ctx.fillText(filteredEntries.length + ' participantes', width - 136, 97);
  ctx.textAlign = 'left';
  try {
    const portrait = await loadImage(BRAND.avatarPath);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.arc(width - 78, 82, 38, 0, Math.PI * 2);
      ctx.clip();
      const cropSize = Math.min(portrait.width, portrait.height);
      ctx.drawImage(portrait, (portrait.width - cropSize) / 2, (portrait.height - cropSize) / 2, cropSize, cropSize, width - 116, 44, 76, 76);
    } finally {
      ctx.restore();
    }
  } catch {
    // El ranking sigue funcionando si el recurso de marca no está disponible.
  }

  // If empty
  if (filteredEntries.length === 0) {
    ctx.fillStyle = THEME.textDim;
    ctx.font = `24px ${FONT_FALLBACKS}`;
    ctx.textAlign = 'center';
    ctx.fillText('No hay actividad registrada en este período todavía.', width / 2, headerH + 60);
    ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
  }

  const startY = headerH + 10;
  const avatarSize = 74;

  const profiles = readProfiles();
  for (let i = 0; i < filteredEntries.length; i++) {
    const entry = filteredEntries[i];
    const y = startY + i * (rowH + gap);

    // Card background
    ctx.fillStyle = i % 2 === 0 ? THEME.card : THEME.cardAlt;
    roundRect(ctx, 20, y, width - 40, rowH, 14);
    ctx.fill();

    // Rank Circle Badge
    const rankX = 60;
    const rankY = y + rowH / 2;
    const rankR = 22;
    ctx.beginPath();
    ctx.arc(rankX, rankY, rankR, 0, Math.PI * 2);
    ctx.fillStyle = (i < 3) ? THEME.rankColors[i] : '#111214';
    ctx.fill();

    ctx.fillStyle = (i < 3) ? '#000000' : THEME.text;
    ctx.font = `bold 20px ${FONT_FALLBACKS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i + 1}`, rankX, rankY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Avatar
    const avX = 105;
    const avY = y + (rowH - avatarSize) / 2;
    let avatarBuf = null;
    let username = entry.id;

    const userProfile = ensureUser(profiles, guild.id, entry.id);
    const userBarColor = userProfile.barColor || userProfile.accent || THEME.accentA;

    try {
      const member = guild.members.cache.get(entry.id) || await guild.members.fetch(entry.id).catch(() => null);
      if (member) {
        username = member.displayName || member.user?.displayName || member.user?.username;
        const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
        avatarBuf = await fetchAvatarBuffer(avatarUrl);
      } else {
        const user = await client.users.fetch(entry.id).catch(() => null);
        if (user) {
          username = user.displayName || user.username;
          const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
          avatarBuf = await fetchAvatarBuffer(avatarUrl);
        }
      }
    } catch {}

    const borderColor = (i < 3) ? THEME.rankColors[i] : '#35373C';
    await drawCircularAvatar(ctx, avatarBuf, avX, avY, avatarSize, borderColor, username);

    // Username (Server Display Name)
    const nameX = avX + avatarSize + 22;
    const nameY = y + 45;
    ctx.fillStyle = THEME.text;
    ctx.font = `bold 30px ${FONT_FALLBACKS}`;

    let maxNameWidth = 400;
    let displayName = username;
    while (ctx.measureText(displayName).width > maxNameWidth && displayName.length > 3) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== username) displayName += '...';
    ctx.fillText(displayName, nameX, nameY);

    // Detail subtitle
    ctx.fillStyle = THEME.textDim;
    ctx.font = `17px ${FONT_FALLBACKS}`;
    ctx.fillText(fitCanvasText(ctx, entry.detail, 455), nameX, nameY + 30);

    // Right side metric (Score / Level Badge)
    const rightX = width - 260;
    if (category === 'general' && timeframe !== 'global') {
      ctx.fillStyle = THEME.text;
      ctx.font = 'bold 26px ' + FONT_FALLBACKS;
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(entry.score) + ' XP', width - 60, nameY + 12);
      ctx.textAlign = 'left';
    } else if (category === 'general') {
      const levelText = `Nivel ${entry.level}`;
      ctx.fillStyle = THEME.text;
      ctx.font = `bold 26px ${FONT_FALLBACKS}`;
      ctx.textAlign = 'right';
      ctx.fillText(levelText, width - 60, nameY);

      // Progress bar
      const need = levelService.xpToNext(entry.level);
      const percent = need > 0 ? Math.max(0, Math.min(1, entry.xp / need)) : 0;
      const barW = 200;
      const barH = 12;
      const barX = width - 60 - barW;
      const barY = y + rowH - 36;

      ctx.fillStyle = '#111214';
      roundRect(ctx, barX, barY, barW, barH, 6);
      ctx.fill();

      const fillW = Math.floor(percent * barW);
      if (fillW > 0) {
        const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        g.addColorStop(0, userBarColor);
        g.addColorStop(1, THEME.accentB);
        ctx.fillStyle = g;
        roundRect(ctx, barX, barY, fillW, barH, 6);
        ctx.fill();
      }

      ctx.textAlign = 'left';
    } else if (category === 'voice') {
      const mins = Math.floor((timeframe === 'global' ? entry.voiceMs : (timeframe === 'weekly' ? entry.weekly.voiceMs : entry.daily.voiceMs)) / 60000);
      const hours = (mins / 60).toFixed(1);
      ctx.fillStyle = THEME.accentB;
      ctx.font = `bold 24px ${FONT_FALLBACKS}`;
      ctx.textAlign = 'right';
      ctx.fillText(formatVoiceTime(mins * 60000), width - 60, nameY + 12);
      ctx.textAlign = 'left';
    } else if (category === 'text') {
      const msgs = timeframe === 'global' ? entry.messages : (timeframe === 'weekly' ? entry.weekly.messages : entry.daily.messages);
      ctx.fillStyle = '#A78BFA';
      ctx.font = `bold 24px ${FONT_FALLBACKS}`;
      ctx.textAlign = 'right';
      ctx.fillText(formatNumber(msgs) + ' mensajes', width - 60, nameY + 12);
      ctx.textAlign = 'left';
    }
  }

  return canvas.toBuffer('image/png');
}

function buildNavigationComponents(activeTimeframe, activeCategory) {
  // Row 1: Timeframe
  const timeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lb_time_global')
      .setLabel('Global')
      .setEmoji('🌍')
      .setStyle(activeTimeframe === 'global' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_time_weekly')
      .setLabel('Semanal')
      .setEmoji('📅')
      .setStyle(activeTimeframe === 'weekly' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_time_daily')
      .setLabel('Diario')
      .setEmoji('☀️')
      .setStyle(activeTimeframe === 'daily' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  // Row 2: Category
  const catRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('lb_cat_general')
      .setLabel('General')
      .setEmoji('🏆')
      .setStyle(activeCategory === 'general' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_cat_text')
      .setLabel('Mensajes')
      .setEmoji('💬')
      .setStyle(activeCategory === 'text' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_cat_voice')
      .setLabel('Tiempo en voz')
      .setEmoji('🎙️')
      .setStyle(activeCategory === 'voice' ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  return [timeRow, catRow];
}

module.exports = {
  renderLeaderboardCanvas, buildNavigationComponents, getCategorySubtitle, getTimeframeTitle,
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Consulta los rankings de XP, mensajes y tiempo en voz.')
    .addStringOption(opt =>
      opt.setName('periodo')
        .setDescription('Filtra la clasificación por período de tiempo')
        .setRequired(false)
        .addChoices(
          { name: '🌍 Global (Todos los tiempos)', value: 'global' },
          { name: '📅 Semanal (Esta semana)', value: 'weekly' },
          { name: '☀️ Diario (Hoy)', value: 'daily' }
        )
    )
    .addStringOption(opt =>
      opt.setName('categoria')
        .setDescription('Filtra por tipo de actividad')
        .setRequired(false)
        .addChoices(
          { name: 'General · Nivel / XP del período', value: 'general' },
          { name: '💬 Chat Texto (Mensajes)', value: 'text' },
          { name: '🎙️ Canales de Voz (Tiempo en llamada)', value: 'voice' }
        )
    ),

  async execute(interaction, client) {
    if (!interaction.guild) {
      return interaction.reply({ content: '❌ Este comando solo puede usarse dentro de un servidor.', ephemeral: true });
    }

    await interaction.deferReply();

    let currentTimeframe = interaction.options?.getString('periodo') || 'global';
    let currentCategory = interaction.options?.getString('categoria') || 'general';

    const renderCurrent = async () => {
      const entries = await levelService.getGuildLeaderboard(interaction.guild, currentTimeframe, currentCategory, 10);
      const buffer = await renderLeaderboardCanvas(interaction.guild, entries, currentTimeframe, currentCategory, client || interaction.client);
      const attach = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
      const components = buildNavigationComponents(currentTimeframe, currentCategory);
      return { files: [attach], attachments: [], components };
    };

    const initialData = await renderCurrent();
    const message = await interaction.editReply(initialData);

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 90_000
    });

    let renderQueue = Promise.resolve();
    collector.on('collect', async i => {
      try {
        await i.deferUpdate();
        renderQueue = renderQueue.then(async () => {
          if (i.customId.startsWith('lb_time_')) {
            currentTimeframe = i.customId.replace('lb_time_', '');
          } else if (i.customId.startsWith('lb_cat_')) {
            currentCategory = i.customId.replace('lb_cat_', '');
          }
          const updatedData = await renderCurrent();
          await interaction.editReply(updatedData);
        }).catch(async error => {
          logger.error('[leaderboard] No se pudo actualizar la tabla', { error: error.message });
          await i.followUp({
            content: 'No pude consultar el ranking en este momento. Intenta nuevamente.',
            ephemeral: true
          }).catch(() => {});
        });
        await renderQueue;
      } catch (error) {
        logger.warn('[leaderboard] Interaccion expirada', { error: error.message });
      }
    });

    collector.on('end', async () => {
      try {
        const disabledRows = buildNavigationComponents(currentTimeframe, currentCategory).map(row => {
          row.components.forEach(btn => btn.setDisabled(true));
          return row;
        });
        await interaction.editReply({ components: disabledRows });
      } catch {}
    });
  },

  async executePrefix(message, args, client) {
    if (!message.guild) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }

    let timeframe = 'global';
    let category = 'general';

    if (args[0]) {
      const a0 = args[0].toLowerCase();
      if (['semanal', 'weekly', 'semana'].includes(a0)) timeframe = 'weekly';
      else if (['diario', 'daily', 'hoy'].includes(a0)) timeframe = 'daily';
      else if (['voz', 'voice'].includes(a0)) category = 'voice';
      else if (['texto', 'text', 'chat'].includes(a0)) category = 'text';
    }

    if (args[1]) {
      const a1 = args[1].toLowerCase();
      if (['voz', 'voice'].includes(a1)) category = 'voice';
      else if (['texto', 'text', 'chat'].includes(a1)) category = 'text';
    }

    let replyMessage;
    const fakeInteraction = {
      guild: message.guild,
      guildId: message.guild.id,
      user: message.author,
      client: client || message.client,
      options: {
        getString: (name) => (name === 'periodo' ? timeframe : name === 'categoria' ? category : null)
      },
      replied: false,
      deferred: false,
      reply: async (data) => message.reply(data),
      deferReply: async () => {},
      editReply: async (data) => {
        if (replyMessage) return replyMessage.edit(data);
        replyMessage = await message.reply(data);
        return replyMessage;
      }
    };

    await module.exports.execute(fakeInteraction, client || message.client);
  }
};
