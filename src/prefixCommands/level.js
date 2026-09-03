const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const logger = require('../utils/logger');

const dataDir = path.join(__dirname, '..', '..', 'data');
const { readLevels, ensureUserData, xpToNext, getUserRank } = require('../services/level').levelService;
const { readProfiles, ensureUser } = require('../utils/profileStore');
const { initFonts, FONT_FALLBACKS } = require('../utils/canvasFontLoader');

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

const { normalizeExternalImageUrl } = require('../utils/urlSafety');

async function fetchAvatarBuffer(url) {
  const safeUrl = normalizeExternalImageUrl(url);
  if (!safeUrl) return null;

  try {
    const res = await fetch(safeUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    if (!res.ok) throw new Error('avatar fetch failed');
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

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
      const guildId = message.guild.id;

      // Leer SIEMPRE desde utils
      const levels = readLevels();
      const userData = ensureUserData(levels, guildId, targetUser.id);

      const need = xpToNext(userData.level || 0);
      const percent = need > 0 ? Math.floor(((userData.xp || 0) / need) * 100) : 0;
      const rankNum = getUserRank(guildId, targetUser.id, levels, message.guild);
      const rank = rankNum > 0 ? rankNum : '—';

      // Canvas
      const width = 900;
      const height = 250;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      // Panel
      const panelX = 0;
      const panelY = 0;
      const panelW = width;
      const panelH = height;
      ctx.fillStyle = '#2B1C28';
      roundRect(ctx, panelX, panelY, panelW, panelH, 18);
      ctx.fill();

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
            ctx.beginPath();
            ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 6, 0, Math.PI * 2);
            ctx.fillStyle = '#000000ff';
            ctx.fill();
            ctx.save();
            ctx.beginPath();
            ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
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

      const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
      const serverDisplayName = targetMember?.displayName || targetUser.displayName || targetUser.globalName || targetUser.username;

      const profiles = readProfiles();
      const userProfile = ensureUser(profiles, message.guild.id, targetUser.id);
      const barColor = userProfile.barColor || userProfile.accent || '#C45A78';

      // Username (Server Nickname con auto-escalado)
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

      // Rank box
      ctx.fillStyle = '#FFB86B';
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
      ctx.fillText(`Level ${userData.level || 0}`, panelX + panelW - 132, avY + 80);

      // Progress bar
      const barX = nameX;
      const barY = avY + avSize - 36;
      const barW = panelW - (barX - panelX) - 180;
      const barH = 22;

      ctx.fillStyle = '#6d6c6cd2';
      roundRect(ctx, barX, barY, barW, barH, barH / 2);
      ctx.fill();

      const fillW = Math.max(0, Math.min(1, (userData.xp || 0) / (need || 1))) * barW;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, barColor);
        grad.addColorStop(1, lightenHex(barColor, 0.35));
        ctx.fillStyle = grad;
        roundRect(ctx, barX, barY, fillW, barH, barH / 2);
        ctx.fill();
      }

      // Progress text
      ctx.font = `17px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#D7B8C2';
      ctx.fillText(`${userData.xp || 0} / ${need} XP • ${percent}%`, barX + barW + 12, barY + barH - 6);

      // Footer (server name)
      ctx.font = `20px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#D7B8C2';
      ctx.fillText(`${message.guild.name}`, panelX + 36, panelY + panelH - 16);

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'level.png' });
      return message.reply({ files: [attach] });
    } catch (err) {
      logger.error('[prefix/level] Error al generar imagen de nivel:', { error: err.message, stack: err.stack });
      return message.reply('❌ Error al generar la imagen de nivel');
    }
  }
};
