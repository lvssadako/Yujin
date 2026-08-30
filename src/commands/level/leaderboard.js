const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const dataDir = path.join(__dirname, '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

const THEME = {
  panel: '#2A1B2E',
  card: '#3B2144',
  accentA: '#FF4B8B',
  accentB: '#FF6F61',
  text: '#F6E6FA',
  textDim: '#C79ECF',
  rankColors: ['#FFD700', '#C0C0C0', '#CD7F32'] // 1..3
};

function readLevels() { 
  try { 
    const data = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));
    // Retornar estructura compatible (guilds o raíz)
    return data.guilds || data;
  } catch { 
    return {}; 
  } 
}

function xpToNext(level) { return Math.round(200 * Math.pow(level + 1, 1.4)); }
function roundRect(ctx, x, y, w, h, r) {
  if (w < 2*r) r = w/2; if (h < 2*r) r = h/2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function fetchAvatarBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('avatar fetch failed');
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function drawCircularAvatar(ctx, buffer, x, y, size, borderColor) {
  try {
    const img = await loadImage(buffer);
    ctx.save();
    // border
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2 + 4, 0, Math.PI*2);
    ctx.fillStyle = borderColor;
    ctx.fill();
    // avatar
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2, 0, Math.PI*2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } catch {
    // fallback rectangle
    ctx.fillStyle = '#0d0e0dff';
    ctx.fillRect(x, y, size, size);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 Top 10 usuarios con más nivel'),

  async execute(interaction, client) {
    await interaction.deferReply();

    const topN = 10; // Fixed to top 10
    const guildId = interaction.guildId;
    const allLevels = readLevels(); // puede retornar { guilds: {...} } o { guildId: {...} }
    const guildData = allLevels.guilds?.[guildId] || allLevels[guildId] || {}; // compatible con ambas estructuras
    const arr = Object.entries(guildData)
      .map(([id, d]) => ({ id, level: d.level || 0, xp: d.xp || 0 }))
      .sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level; // primero por nivel
        return b.xp - a.xp; // desempate por XP
      })
      .slice(0, topN);

    if (arr.length === 0) {
      // Solo responde si no se ha respondido antes
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({ content: 'No hay datos de niveles todavía.', flags: 64 });
      } else {
        return interaction.editReply({ content: 'No hay datos de niveles todavía.' });
      }
    }

    // Layout
    const width = 1200;
    const rowH = 110;
    const headerH = 160;
    const gap = 18;
    const height = headerH + arr.length * (rowH + gap) + 40;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // No background fill — canvas stays transparent

    // Main panel container (centered)
    const panelX = 0;
    const panelW = width - panelX*2;
    const panelY = 0;
    const panelH = height - 60;
    ctx.fillStyle = THEME.panel;
    roundRect(ctx, panelX, panelY, panelW, panelH, 18);
    ctx.fill();

    // Header area inside panel
    const headerPad = 36;
    let title = interaction.guild.name || 'Servidor';
    // scale title to fit
    ctx.font = 'bold 44px "Segoe UI"';
    let measured = ctx.measureText(title).width;
    if (measured > panelW - headerPad*2) {
      // reduce font until fits (min 20)
      for (let size = 44; size >= 20; size--) {
        ctx.font = `bold ${size}px "Segoe UI"`;
        if (ctx.measureText(title).width <= panelW - headerPad*2) break;
      }
    }
    ctx.fillStyle = THEME.text;
    ctx.fillText(title, panelX + headerPad, panelY + headerPad + 12);

    ctx.font = '18px "Segoe UI"';
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`Top ${arr.length} usuarios con más nivel`, panelX + headerPad, panelY + headerPad + 48);

    // Draw each entry inside a container area
    const startY = panelY + headerH - 20;
    const avatarSize = 84;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      const y = startY + i * (rowH + gap);

      // Card
      const cardX = panelX + 28;
      const cardW = panelW - 56;
      const cardH = rowH;
      ctx.fillStyle = THEME.card;
      roundRect(ctx, cardX, y, cardW, cardH, 14);
      ctx.fill();

      // Left rank circle (colored for top 3)
      const rankX = cardX + 18;
      const rankY = y + cardH/2;
      const rankR = 24;
      ctx.beginPath();
      ctx.arc(rankX, rankY, rankR, 0, Math.PI*2);
      ctx.fillStyle = (i < 3) ? THEME.rankColors[i] : '#050606ff';
      ctx.fill();

      // Rank number
      ctx.fillStyle = (i < 3) ? '#000000ff' : '#ffffffff';
      ctx.font = 'bold 20px "Segoe UI"';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${i+1}`, rankX, rankY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      // Avatar (fetch buffer then draw circular with colored border)
      const avX = cardX + 18 + rankR*2 + 12;
      const avY = y + (cardH - avatarSize)/2;
      let avatarBuf = null;
      try {
        const user = await client.users.fetch(e.id).catch(()=>null);
        if (user) {
          const url = user.displayAvatarURL({ extension: 'png', size: 256 });
          avatarBuf = await fetchAvatarBuffer(url);
          const borderColor = (i < 3) ? THEME.rankColors[i] : '#000000ff';
          await drawCircularAvatar(ctx, avatarBuf || (await loadImage(Buffer.from([])).catch(()=>null)), avX, avY, avatarSize, borderColor);
        } else {
          // placeholder
          ctx.fillStyle = '#2b2d30';
          roundRect(ctx, avX, avY, avatarSize, avatarSize, 12);
          ctx.fill();
        }
      } catch {
        ctx.fillStyle = '#2b2d30';
        roundRect(ctx, avX, avY, avatarSize, avatarSize, 12);
        ctx.fill();
      }

      // Username (ensure fits)
      const nameX = avX + avatarSize + 20;
      const nameY = y + 50;
      let username = e.id;
      try {
        const user = await client.users.fetch(e.id).catch(()=>null);
        if (user) username = user.username;
      } catch {}
      ctx.fillStyle = THEME.text;
      ctx.font = 'bold 40px "Segoe UI"';
      // shrink name if too long
      let nameMaxW = cardW - (nameX - cardX) - 320;
      let fontSize = 45;
      while (ctx.measureText(username).width > nameMaxW && fontSize > 30) {
        fontSize -= 1;
        ctx.font = `bold ${fontSize}px "Segoe UI"`;
      }
      ctx.fillText(username, nameX, nameY);

      // Level (right)
      const levelText = `Level ${e.level}`;
      ctx.fillStyle = THEME.text;
      ctx.font = 'bold 35px "Segoe UI"';
      const levelX = cardX + cardW - 140;
      ctx.fillText(levelText, levelX, nameY);

      // Progress bar (as 'image-like' pill with glossy highlight)
      const need = xpToNext(e.level);
      const percent = need > 0 ? Math.max(0, Math.min(1, e.xp / need)) : 0;
      const barX = nameX;
      const barY = y + cardH - 36;
      const barW = cardW - (barX - cardX) - 160;
      const barH = 16;

      // bar background
      ctx.fillStyle = '#6d6c6cd2';
      roundRect(ctx, barX, barY, barW, barH, barH/2);
      ctx.fill();

      // filled portion (gradient)
      const fillW = Math.floor(percent * barW);
      if (fillW > 0) {
        const g = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        g.addColorStop(0, THEME.accentA);
        g.addColorStop(1, THEME.accentB);
        ctx.fillStyle = g;
        roundRect(ctx, barX, barY, fillW, barH, barH/2);
        ctx.fill();

        // glossy highlight (overlay)
        ctx.globalAlpha = 0.18;
        const glossGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        glossGrad.addColorStop(0, '#ffffff');
        glossGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glossGrad;
        roundRect(ctx, barX, barY, fillW, barH/2, barH/2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // XP text at right of bar
      ctx.fillStyle = THEME.textDim;
      ctx.font = '18px "Segoe UI"';
      ctx.fillText(`${e.xp} / ${need} XP`, barX + barW + 14, barY + barH - 2);
    }

    const buffer = canvas.toBuffer('image/png');
    const attach = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });
    // Solo responde si no se ha respondido antes
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ files: [attach] });
    } else {
      return interaction.editReply({ files: [attach] });
    }
  },
    // --- Permite uso con prefijo ---
  async executePrefix(message, args, client) {
    // Solo permite en servidores y si todo está definido
    if (!message.guild || !message.member || !message.author || !message.guild.id) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }
    // Llama a execute con un objeto que simula la interacción, pero asegura que solo responde una vez
    const fakeInteraction = {
      guild: message.guild,
      guildId: message.guild.id,
      user: message.author,
      replied: false,
      deferred: false,
      reply: async (data) => {
        fakeInteraction.replied = true;
        return message.reply(data);
      },
      editReply: async (data) => message.reply(data),
      deferReply: async () => { fakeInteraction.deferred = true; },
      channel: message.channel,
      member: message.member,
    };
    // Validar que user.id existe antes de ejecutar
    if (!fakeInteraction.user || !fakeInteraction.user.id) {
      return message.reply('❌ No se pudo obtener tu usuario correctamente.');
    }
    await module.exports.execute(fakeInteraction, client);
  }
};