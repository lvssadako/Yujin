const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const dataDir = path.join(__dirname, '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');

function readLevels() { try { return JSON.parse(fs.readFileSync(levelsPath, 'utf8')); } catch { return {}; } }
function xpToNext(level) { return 100 * Math.pow(level + 1, 2); }

function getUserRank(guildId, userId, levels) {
  const guildData = levels[guildId] || {};
  const sortedUsers = Object.entries(guildData)
    .map(([id, data]) => ({ id, level: data.level || 0, xp: data.xp || 0 }))
    .sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  return sortedUsers.findIndex(u => u.id === userId) + 1;
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

async function resolveMember(guild, input) {
  if (!input) return null;
  input = input.trim();
  const mention = input.match(/^<@!?(\d+)>$/);
  if (mention) {
    try { return await guild.members.fetch(mention[1]); } catch { return null; }
  }
  if (/^\d{17,19}$/.test(input)) {
    try { return await guild.members.fetch(input); } catch {}
  }
  if (input.includes('#')) {
    const member = guild.members.cache.find(m => m.user.tag.toLowerCase() === input.toLowerCase());
    if (member) return member;
  }
  let member = guild.members.cache.find(m =>
    m.user.username.toLowerCase() === input.toLowerCase() ||
    m.displayName.toLowerCase() === input.toLowerCase()
  );
  if (member) return member;
  try {
    const fetched = await guild.members.fetch({ query: input, limit: 5 });
    if (fetched && fetched.size) return fetched.first();
  } catch {}
  return null;
}

module.exports = {
  name: 'level',
  description: 'Muestra nivel y progreso (imagen). Uso: level [mención|id|nombre]',
  async execute(message, args) {
    try {
      const targetArg = args[0];
      let member = null;
      if (targetArg) {
        member = await resolveMember(message.guild, targetArg);
      } else {
        member = message.member;
      }
      if (!member) return message.reply('❌ Usuario no encontrado.');

      const targetUser = member.user;
      const guildId = message.guildId;
      const levels = readLevels();
      const userData = (levels[guildId] && levels[guildId][targetUser.id]) || { xp: 0, level: 0 };
      const need = xpToNext(userData.level);
      const percent = need > 0 ? Math.floor((userData.xp / need) * 100) : 0;
      const rank = getUserRank(guildId, targetUser.id, levels) || '—';

      // Canvas (same design as slash)
      const width = 900;
      const height = 250;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0,0,width,height);

      //panel
      const panelX = 0;
      const panelY = 0;
      const panelW = width;
      const panelH = height;
      ctx.fillStyle = '#fd8cf0f1';
      roundRect(ctx, panelX, panelY, panelW, panelH, 18);
      ctx.fill();

      ctx.fillStyle = '#fab7e5ff';
      roundRect(ctx, panelX, panelY, 12, panelH, 8);
      ctx.fill();

      const avSize = 140;
      const avX = panelX + 32;
      const avY = panelY + (panelH - avSize) / 2;
      try {
        const url = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
        const avBuf = await fetchAvatarBuffer(url);
        if (avBuf) {
          const img = await loadImage(avBuf);
          ctx.beginPath();
          ctx.arc(avX + avSize/2, avY + avSize/2, avSize/2 + 6, 0, Math.PI*2);
          ctx.fillStyle = '#000000ff';
          ctx.fill();
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

      //username
      const nameX = avX + avSize + 28;
      const nameY = avY + 70;
      ctx.fillStyle = '#44011fff';
      ctx.font = 'bold 50px "Segoe UI"';
      ctx.fillText(`${targetUser.username}`, nameX, nameY);
    
      //rank
      ctx.fillStyle = '#FFB86B';
      roundRect(ctx, panelX + panelW - 150, avY + -10, 110, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#0b0c0c';
      ctx.font = 'bold 20px "Segoe UI"';
      ctx.fillText(`Rank #${rank}`, panelX + panelW - 132, avY + 20);

      //level box
      ctx.fillStyle = '#fab7e5ff';
      roundRect(ctx, panelX + panelW - 150, avY + 50, 110, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#44011fff';
      ctx.font = 'bold 20px "Segoe UI"';
      ctx.fillText(`Level ${userData.level}`, panelX + panelW - 132, avY + 80);

      //progress bar
      const barX = nameX;
      const barY = avY + avSize - 36;
      const barW = panelW - (barX - panelX) - 180;
      const barH = 22;

      //background
      ctx.fillStyle = '#6d6c6cd2';
      roundRect(ctx, barX, barY, barW, barH, barH/2);
      ctx.fill();

      //fill
      const fillW = Math.max(0, Math.min(1, userData.xp / need)) * barW;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, '#f8c988ff');
        grad.addColorStop(1, '#f70000ff');
        ctx.fillStyle = grad;
        roundRect(ctx, barX, barY, fillW, barH, barH/2);
        ctx.fill();
      }
      //progress text
      ctx.font = '17px "Segoe UI"';
      ctx.fillStyle = '#060607ff';
      ctx.fillText(`${userData.xp} / ${need} XP • ${percent}%`, barX + barW + 12, barY + barH - 6);
      
      // Small footer with server name
      ctx.font = '20px "Segoe UI"';
      ctx.fillStyle = '#44011fff';
      ctx.fillText(`${message.guild.name}`, panelX + 36, panelY + panelH - 16);

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'level.png' });
      return message.reply({ files: [attach] });
    } catch (err) {
      console.error('prefix level error:', err);
      return message.reply('Error al generar la imagen de nivel');
    }
  }
};