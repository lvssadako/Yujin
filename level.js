const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readLevels, xpToNext, getUserRank } = require('../utils/levelStore');

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

      // Transparent background en caso de volverlo a usar ctx.clearRect(0, 0, width, height);
      

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
      let avBuf = null;
      try {
        const url = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
        avBuf = await fetchAvatarBuffer(url);
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

      // Username and tag
      const nameX = avX + avSize + 28;
      const nameY = avY + 70;
      ctx.fillStyle = '#FBE5E3';
      ctx.font = 'bold 50px "Segoe UI"';
      ctx.fillText(`${targetUser.username}`, nameX, nameY);

      // Rank badge
      ctx.fillStyle = '#E6B655';
      roundRect(ctx, panelX + panelW - 150, avY + -10, 110, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#0b0c0c';
      ctx.font = 'bold 20px "Segoe UI"';
      ctx.fillText(`Rank #${rank}`, panelX + panelW - 132, avY + 20);
      // Level box
      ctx.fillStyle = '#C45A78';
      roundRect(ctx, panelX + panelW - 150, avY + 50, 110, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#44011fff';
      ctx.font = 'bold 20px "Segoe UI"';
      ctx.fillText(`Nivel ${userData.level}`, panelX + panelW - 132, avY + 80);

      // Progress bar
      const barX = nameX;
      const barY = avY + avSize - 36;
      const barW = panelW - (barX - panelX) - 180;
      const barH = 22;

      // background
      ctx.fillStyle = '#6d6c6cd2)';
      roundRect(ctx, barX, barY, barW, barH, barH/2);
      ctx.fill();

      // fill
      const fillW = Math.max(0, Math.min(1, userData.xp / need)) * barW;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, '#C45A78');
        grad.addColorStop(1, '#F8B5A0');
        ctx.fillStyle = grad;
        roundRect(ctx, barX, barY, fillW, barH, barH/2);
        ctx.fill();
      }
      // progress text
      ctx.font = '15px "Segoe UI"';
      ctx.fillStyle = '#D7B8C2';
      ctx.fillText(`${userData.xp} / ${need} XP • ${percent}%`, barX + barW + 12, barY + barH - 6);

      // Small footer with server name
      ctx.font = '20px "Segoe UI"';
      ctx.fillStyle = '#D7B8C2';
      ctx.fillText(`${interaction.guild.name}`, panelX + 36, panelY + panelH - 16);

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'level.png' });
      return interaction.editReply({ files: [attach] });
    } catch (err) {
      console.error('level command error:', err);
      return interaction.editReply('❌ Error al mostrar el nivel');
    }
  },

  async run(message, args) {
    // ...prefix command logic...
  }
};