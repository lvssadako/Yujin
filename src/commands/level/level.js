const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readLevels, xpToNext, getUserRank } = require('../../services/level').levelService;
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { initFonts, FONT_FALLBACKS } = require('../../utils/canvasFontLoader');

initFonts();

function lightenHex(hex, amount = 0.35) {
  try {
    const h = String(hex || '#C45A78').replace('#', '');
    const n = parseInt(h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    const toHex = v => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return '#F8B5A0'; }
}

const dataDir = path.join(__dirname, '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

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

module.exports = {
  name: 'level',
  description: 'Muestra el nivel de un usuario',
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Muestra nivel y progreso de un usuario')
    .addUserOption(u => u.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),

  async execute(interaction) {
    // Defer the reply immediately
    await interaction.deferReply();
    try {
      const targetUser = interaction.options.getUser('usuario') || interaction.user;
      const guildId = interaction.guildId;
      const levels = readLevels();
      const guildData = levels.guilds?.[guildId] || levels[guildId] || {};
      const userData = guildData[targetUser.id] || { xp: 0, level: 0 };
      const need = xpToNext(userData.level);
      const percent = need > 0 ? Math.floor((userData.xp / need) * 100) : 0;
      const rank = getUserRank(guildId, targetUser.id, levels) || '—';

      // Canvas design
      const width = 900;
      const height = 250;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Panel
      const panelX = 0;
      const panelY = 0;
      const panelW = width;
      const panelH = height;
      ctx.fillStyle = '#2B1C28';
      roundRect(ctx, panelX, panelY, panelW, panelH, 18);
      ctx.fill();

      // Accent strip
      ctx.fillStyle = '#1B1126';
      roundRect(ctx, panelX, panelY, 12, panelH, 8);
      ctx.fill();

      // Avatar
      const avSize = 140;
      const avX = panelX + 32;
      const avY = panelY + (panelH - avSize) / 2;
      try {
        const url = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
        const avBuf = await fetchAvatarBuffer(url);
        if (avBuf) {
          const img = await loadImage(avBuf);
          // border
          ctx.beginPath();
          ctx.arc(avX + avSize/2, avY + avSize/2, avSize/2 + 6, 0, Math.PI*2);
          ctx.fillStyle = '#000000ff';
          ctx.fill();
          // avatar circle
          ctx.save();
          ctx.beginPath();
          ctx.arc(avX + avSize/2, avY + avSize/2, avSize/2, 0, Math.PI*2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, avX, avY, avSize, avSize);
          ctx.restore();
        } else {
          ctx.fillStyle = '#2b2d30';
          roundRect(ctx, avX, avY, avSize, avSize, 14);
          ctx.fill();
        }
      } catch {
        ctx.fillStyle = '#2b2d30';
        roundRect(ctx, avX, avY, avSize, avSize, 14);
        ctx.fill();
      }

      const member = interaction.guild ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;
      const serverDisplayName = member?.displayName || targetUser.displayName || targetUser.globalName || targetUser.username;

      const profiles = readProfiles();
      const userProfile = ensureUser(profiles, guildId, targetUser.id);
      const barColor = userProfile.barColor || userProfile.accent || '#C45A78';

      // Username and tag (Server Nickname con auto-escalado)
      const nameX = avX + avSize + 28;
      const nameY = avY + 70;
      ctx.fillStyle = '#FBE5E3';
      let nameSize = 50;
      ctx.font = `bold ${nameSize}px ${FONT_FALLBACKS}`;
      const maxNameW = panelW - (nameX - panelX) - 180;
      while (ctx.measureText(serverDisplayName).width > maxNameW && nameSize > 22) {
        nameSize -= 2;
        ctx.font = `bold ${nameSize}px ${FONT_FALLBACKS}`;
      }
      ctx.fillText(serverDisplayName, nameX, nameY);

      // Rank badge
      ctx.fillStyle = '#E6B655';
      roundRect(ctx, panelX + panelW - 150, avY - 10, 110, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#0b0c0c';
      ctx.font = `bold 20px ${FONT_FALLBACKS}`;
      ctx.fillText(`Rank #${rank}`, panelX + panelW - 132, avY + 20);

      // Level box
      ctx.fillStyle = barColor;
      roundRect(ctx, panelX + panelW - 150, avY + 50, 110, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 20px ${FONT_FALLBACKS}`;
      ctx.fillText(`Nivel ${userData.level}`, panelX + panelW - 132, avY + 80);

      // Progress bar
      const barX = nameX;
      const barY = avY + avSize - 36;
      const barW = panelW - (barX - panelX) - 180;
      const barH = 22;

      // background
      ctx.fillStyle = '#6d6c6cd2';
      roundRect(ctx, barX, barY, barW, barH, barH/2);
      ctx.fill();

      // fill
      const fillW = Math.max(0, Math.min(1, (userData.xp || 0) / (need || 1))) * barW;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, barColor);
        grad.addColorStop(1, lightenHex(barColor, 0.35));
        ctx.fillStyle = grad;
        roundRect(ctx, barX, barY, fillW, barH, barH/2);
        ctx.fill();
      }
      // progress text
      ctx.font = `15px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#D7B8C2';
      ctx.fillText(`${userData.xp} / ${need} XP • ${percent}%`, barX + barW + 12, barY + barH - 6);

      // Small footer with server name
      ctx.font = `20px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#D7B8C2';
      ctx.fillText(`${interaction.guild.name}`, panelX + 36, panelY + panelH - 16);

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'level.png' });
      return interaction.editReply({ files: [attach] });
    } catch (err) {
      logger.error('level command error:', err);
      return interaction.editReply('❌ Error al mostrar el nivel');
    }
  },

  async run(message, args) {
    // ...prefix command logic...
  }
};