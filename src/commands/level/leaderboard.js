const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const logger = require('../../utils/logger');
const { levelService } = require('../../services/level');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');

const THEME = {
  panel: '#1E1F22',
  card: '#2B2D31',
  cardAlt: '#313338',
  accentA: '#5865F2',
  accentB: '#EB459E',
  text: '#F2F3F5',
  textDim: '#949BA4',
  rankColors: ['#FEE75C', '#C0C0C0', '#CD7F32'] // Gold, Silver, Bronze
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
  const safeUrl = normalizeExternalImageUrl(url);
  if (!safeUrl) return null;
  try {
    const res = await fetch(safeUrl, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function drawCircularAvatar(ctx, buffer, x, y, size, borderColor) {
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
    ctx.restore();
  }
}

function getTimeframeTitle(timeframe) {
  switch (timeframe) {
    case 'daily': return '☀️ Top Diario (Hoy)';
    case 'weekly': return '📅 Top Semanal (Esta Semana)';
    case 'global':
    default: return '🌍 Top Global (Todos los tiempos)';
  }
}

function getCategorySubtitle(category) {
  switch (category) {
    case 'text': return '💬 Clasificación por Actividad de Mensajes en Texto';
    case 'voice': return '🎙️ Clasificación por Tiempo en Canales de Voz';
    case 'general':
    default: return '🏆 Clasificación General por Nivel y Experiencia';
  }
}

async function renderLeaderboardCanvas(guild, leaderboardEntries, timeframe, category, client) {
  const width = 1200;
  const rowH = 100;
  const headerH = 150;
  const gap = 14;
  const count = Math.max(1, leaderboardEntries.length);
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

  // Header Title
  ctx.fillStyle = THEME.text;
  ctx.font = 'bold 36px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
  ctx.fillText(guild.name || 'Servidor', 45, 70);

  ctx.fillStyle = THEME.textDim;
  ctx.font = 'bold 20px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
  ctx.fillText(`${getTimeframeTitle(timeframe)} • ${getCategorySubtitle(category)}`, 45, 110);

  // If empty
  if (leaderboardEntries.length === 0) {
    ctx.fillStyle = THEME.textDim;
    ctx.font = '24px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No hay actividad registrada en este período todavía.', width / 2, headerH + 60);
    ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
  }

  const startY = headerH + 10;
  const avatarSize = 74;

  for (let i = 0; i < leaderboardEntries.length; i++) {
    const entry = leaderboardEntries[i];
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
    ctx.font = 'bold 20px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
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

    try {
      const user = await client.users.fetch(entry.id).catch(() => null);
      if (user) {
        username = user.displayName || user.username;
        const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
        avatarBuf = await fetchAvatarBuffer(avatarUrl);
      }
    } catch {}

    const borderColor = (i < 3) ? THEME.rankColors[i] : '#35373C';
    await drawCircularAvatar(ctx, avatarBuf, avX, avY, avatarSize, borderColor);

    // Username
    const nameX = avX + avatarSize + 22;
    const nameY = y + 45;
    ctx.fillStyle = THEME.text;
    ctx.font = 'bold 30px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';

    let maxNameWidth = 400;
    let displayName = username;
    while (ctx.measureText(displayName).width > maxNameWidth && displayName.length > 3) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== username) displayName += '...';
    ctx.fillText(displayName, nameX, nameY);

    // Detail subtitle
    ctx.fillStyle = THEME.textDim;
    ctx.font = '17px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
    ctx.fillText(entry.detail, nameX, nameY + 30);

    // Right side metric (Score / Level Badge)
    const rightX = width - 260;
    if (category === 'general') {
      const levelText = `Nivel ${entry.level}`;
      ctx.fillStyle = THEME.text;
      ctx.font = 'bold 26px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
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
        g.addColorStop(0, THEME.accentA);
        g.addColorStop(1, THEME.accentB);
        ctx.fillStyle = g;
        roundRect(ctx, barX, barY, fillW, barH, 6);
        ctx.fill();
      }

      ctx.textAlign = 'left';
    } else if (category === 'voice') {
      const mins = Math.floor((timeframe === 'global' ? entry.voiceMs : (timeframe === 'weekly' ? entry.weekly.voiceMs : entry.daily.voiceMs)) / 60000);
      const hours = (mins / 60).toFixed(1);
      ctx.fillStyle = '#57F287';
      ctx.font = 'bold 24px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`🎙️ ${hours} hrs (${mins}m)`, width - 60, nameY + 12);
      ctx.textAlign = 'left';
    } else if (category === 'text') {
      const msgs = timeframe === 'global' ? entry.messages : (timeframe === 'weekly' ? entry.weekly.messages : entry.daily.messages);
      ctx.fillStyle = '#5865F2';
      ctx.font = 'bold 24px "Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`💬 ${msgs.toLocaleString()} msgs`, width - 60, nameY + 12);
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
      .setStyle(activeCategory === 'general' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_cat_text')
      .setLabel('Chat Texto')
      .setEmoji('💬')
      .setStyle(activeCategory === 'text' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('lb_cat_voice')
      .setLabel('Canales Voz')
      .setEmoji('🎙️')
      .setStyle(activeCategory === 'voice' ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  return [timeRow, catRow];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 Clasificación y tops de usuarios por nivel, chat de texto y voz')
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
          { name: '🏆 General (Nivel & XP Total)', value: 'general' },
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
      const entries = levelService.getLeaderboard(interaction.guildId, currentTimeframe, currentCategory, 10);
      const buffer = await renderLeaderboardCanvas(interaction.guild, entries, currentTimeframe, currentCategory, client || interaction.client);
      const attach = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
      const components = buildNavigationComponents(currentTimeframe, currentCategory);
      return { files: [attach], components };
    };

    const initialData = await renderCurrent();
    const message = await interaction.editReply(initialData);

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 90_000
    });

    collector.on('collect', async i => {
      if (i.customId.startsWith('lb_time_')) {
        currentTimeframe = i.customId.replace('lb_time_', '');
      } else if (i.customId.startsWith('lb_cat_')) {
        currentCategory = i.customId.replace('lb_cat_', '');
      }

      await i.deferUpdate();
      const updatedData = await renderCurrent();
      await interaction.editReply(updatedData);
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
      editReply: async (data) => message.reply(data)
    };

    await module.exports.execute(fakeInteraction, client || message.client);
  }
};