const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { readProfiles, ensureUser } = require('../utils/profileStore');
const { readConfig } = require('../utils/configCache');
const { readLevels } = require('../utils/levelStore');

// SOLO ESTAS 2 FUNCIONES QUEDAN (el resto se importa de los utils)
function xpToNext(level) { return 100 * Math.pow(level + 1, 2); }
function getUserData(levels, guildId, userId) {
  const g = levels[guildId] || {};
  return g[userId] || { xp: 0, level: 0, messages: 0, voiceTime: 0 };
}
function getUserRank(guildId, userId, levels) {
  const g = levels[guildId] || {};
  const sorted = Object.entries(g)
    .map(([id, d]) => ({ id, level: d.level || 0, xp: d.xp || 0 }))
    .sort((a, b) => (b.level - a.level) || (b.xp - a.xp));
  const idx = sorted.findIndex(u => u.id === userId);
  return idx >= 0 ? idx + 1 : '—';
}

// Descargar a Buffer (URL http/https)
async function fetchBuffer(url) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Referer': 'https://discord.com/',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site'
    };

    const res = await fetch(url, { 
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(10000) // 10 segundos timeout
    });
    
    if (!res.ok) {
      console.warn(`[fetchBuffer] HTTP ${res.status} para ${url}`);
      
      // Si es 404/403, intentar sin query params
      if ((res.status === 404 || res.status === 403) && url.includes('?')) {
        const cleanUrl = url.split('?')[0];
        console.log(`[fetchBuffer] Reintentando sin query: ${cleanUrl}`);
        const retry = await fetch(cleanUrl, { headers, redirect: 'follow' });
        if (retry.ok) {
          const ab = await retry.arrayBuffer();
          return Buffer.from(ab);
        }
      }
      
      return null;
    }
    
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e) {
    console.error(`[fetchBuffer] Error descargando ${url}:`, e?.message || e);
    return null;
  }
}

// Resolver icono de insignia: URL, emoji <:name:id> / <a:name:id>, id numérico o archivo local en assets/badges
async function resolveBadgeIcon(icon) {
  if (!icon) return null;

  // <a:name:123> o <:name:123>
  const m = String(icon).match(/^<a?:\w+:(\d+)>$/);
  if (m) {
    const id = m[1];
    const animated = String(icon).startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=128&quality=lossless`;
    return await fetchBuffer(url);
  }

  // Solo ID numérico
  if (/^\d+$/.test(String(icon))) {
    const url = `https://cdn.discordapp.com/emojis/${icon}.png?size=128&quality=lossless`;
    return await fetchBuffer(url);
  }

  // URL http(s)
  if (/^https?:\/\//i.test(String(icon))) {
    return await fetchBuffer(icon);
  }

  // Ruta local (assets/badges o absoluta)
  try {
    const localPath = path.isAbsolute(icon)
      ? icon
      : path.join(__dirname, '..', 'assets', 'badges', icon);
    return fs.readFileSync(localPath);
  } catch {
    return null;
  }
}

// Agregado: normalizar URLs de CDN para quitar query expirable
function normalizeCdnUrl(u) {
  try {
    const url = new URL(String(u));
    if (
      (url.hostname === 'cdn.discordapp.com' || url.hostname === 'media.discordapp.net') &&
      url.pathname.startsWith('/attachments/')
    ) {
      url.search = ''; // quitar ex, is, hm, etc.
    }
    return url.toString();
  } catch {
    return u;
  }
}

// Agregado: resolver URL de background desde varios campos compatibles (profileset)
function getProfileBackgroundUrl(up) {
  if (!up) return null;
  const raw =
    up.bgUrl ||
    up.backgroundUrl ||
    up.background ||
    up.bg ||
    up.wallpaper ||
    up.cardBg ||
    null;
  
  if (!raw) return null;
  
  // Normalizar y limpiar
  let cleaned = normalizeCdnUrl(raw);
  
  // Si sigue teniendo query params problemáticos, quitarlos
  if (cleaned.includes('?ex=') || cleaned.includes('?is=') || cleaned.includes('?hm=')) {
    cleaned = cleaned.split('?')[0];
    console.log('[profile] URL limpiada de query params expirados:', cleaned);
  }
  
  return cleaned;
}

// Agregado: dibujar imagen con "cover" (manteniendo proporción y cubriendo el área)
function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.width;
  const ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const nw = iw * scale;
  const nh = ih * scale;
  const cx = x + (w - nw) / 2;
  const cy = y + (h - nh) / 2;
  ctx.drawImage(img, cx, cy, nw, nh);
}

// Path de rectángulo redondeado
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

module.exports = {
  name: 'profile',
  description: 'Muestra tu perfil',
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Muestra tu perfil')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const targetUser = interaction.options.getUser('usuario') || interaction.user;
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply('❌ Usuario no encontrado.');

      // Config opcional para posición de badges
      const cfg = readConfig();
      const pcard = (cfg.profileCard || {});
      const CFG_BADGE_SIZE = Number(pcard.badgeSize) || 48;
      const CFG_BADGE_GAP = Number(pcard.badgeGap) || 12;
      const CFG_BADGES_RIGHT_MARGIN = Number.isFinite(Number(pcard.badgesRightMargin)) ? Number(pcard.badgesRightMargin) : 50;
      const CFG_BADGES_X_OFFSET = Number(pcard.badgesXOffset) || 0;
      const CFG_BADGES_START_X = Number.isFinite(Number(pcard.badgesStartX)) ? Number(pcard.badgesStartX) : null;
      const CFG_BADGES_Y_OFFSET = Number(pcard.badgesYOffset) || 0;
      const CFG_BADGES_START_Y = Number.isFinite(Number(pcard.badgesStartY)) ? Number(pcard.badgesStartY) : null;

      // Datos de personalización (profile.json)
      const profiles = readProfiles();
      const up = ensureUser(profiles, interaction.guildId, targetUser.id);

      // Verificar si el usuario es booster
      const isBooster = Boolean(member.premiumSince) || 
        (interaction.guild.roles.premiumSubscriberRole && 
         member.roles.cache.has(interaction.guild.roles.premiumSubscriberRole.id));

      // Si NO es booster, usar valores por defecto (ignorar personalización)
      const profileData = isBooster ? up : {
        title: '',
        accent: '#e94560',
        bgUrl: '',
        bgOpacity: 0.7,
        equippedBadges: [],
        earnedBadges: up.earnedBadges || [], // Mantener insignias ganadas
        streakDays: up.streakDays || 0,
        lastActiveDay: up.lastActiveDay || 0
      };
      // Crear datos de nivel y canvas (debía ir antes de dibujar)
const levels = readLevels();
const userData = getUserData(levels, interaction.guildId, targetUser.id);
const need = xpToNext(userData.level);
const percent = need > 0 ? Math.floor((userData.xp / need) * 100) : 0;
const rank = getUserRank(interaction.guildId, targetUser.id, levels);

const width = 1000, height = 380;
const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// Fondo base
const bgGradient = ctx.createLinearGradient(0, 0, width, height);
bgGradient.addColorStop(0, '#172842');
bgGradient.addColorStop(1, '#0f2742');
ctx.fillStyle = bgGradient;
ctx.fillRect(0, 0, width, height);

const pad = 20;
const panelX = pad, panelY = pad;
const panelW = width - pad * 2, panelH = height - pad * 2;

// Panel
ctx.fillStyle = '#0f3460dd';
roundRect(ctx, panelX, panelY, panelW, panelH, 20);
ctx.fill();

      // Usar profileData en lugar de up en todo el código
      const userBgUrl = getProfileBackgroundUrl(profileData);
      // Fondo personalizado (cover + opacidad)
      // Soporta: bgUrl, backgroundUrl, background, bg, wallpaper, cardBg
      if (userBgUrl) {
        const buf = await fetchBuffer(userBgUrl);
        if (buf) {
          try {
            const bgImg = await loadImage(buf);
            ctx.save();
            const opacity = Number(up.bgOpacity);
            ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.7;
           // IMPORTANTE: Clip para que no salga del borde
            roundRect(ctx, panelX, panelY, panelW, panelH, 20);
            ctx.clip();
            drawImageCover(ctx, bgImg, panelX, panelY, panelW, panelH);
            ctx.restore();
          } catch (e) {
            console.warn('[profile] Error al decodificar background:', e?.message || e);
          }
        } else {
          console.warn('[profile] No se pudo cargar el background (buffer vacío):', userBgUrl);
        }
      }


      // Borde con acento
      ctx.strokeStyle = profileData.accent || '#e94560';
      ctx.lineWidth = 3;
      roundRect(ctx, panelX, panelY, panelW, panelH, 20);
      ctx.stroke();

      // Avatar
      const avSize = 180;
      const avX = panelX + 50;
      const avY = panelY + 50;
      const avUrl = targetUser.displayAvatarURL({ extension: 'png', size: 256 });
      const avBuf = await fetchBuffer(avUrl);
      if (avBuf) {
        const img = await loadImage(avBuf);
        const avatarGrad = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
        avatarGrad.addColorStop(0, '#e94560');
        avatarGrad.addColorStop(1, '#ff6b6b');
        ctx.beginPath();
        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 6, 0, Math.PI * 2);
        ctx.fillStyle = avatarGrad;
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, avX, avY, avSize, avSize);
        ctx.restore();
      } else {
        ctx.fillStyle = '#2b2d30';
        ctx.beginPath();
        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Streak debajo del avatar
      const streakDays = up.streakDays || 0;
      if (streakDays > 0) {
        const streakY = avY + avSize + 20;
        const streakCenterX = avX + avSize / 2;

        const streakGrad = ctx.createLinearGradient(streakCenterX - 60, streakY - 22, streakCenterX + 60, streakY + 22);
        streakGrad.addColorStop(0, '#ff6b6b');
        streakGrad.addColorStop(1, '#ff4757');
        ctx.fillStyle = streakGrad;
        ctx.beginPath();
        roundRect(ctx, streakCenterX - 50, streakY - 20, 100, 40, 20);
        ctx.fill();

        ctx.font = 'bold 30px "Segoe UI"';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 4;
        ctx.fillText(String(streakDays), streakCenterX, streakY + 9);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
      }

      // Info
      const infoX = avX + avSize + 60;
      const infoStartY = panelY + 70;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px "Segoe UI"';
      ctx.fillText(targetUser.username, infoX, infoStartY);

      if (profileData.title) {
        ctx.font = '22px "Segoe UI"';
        ctx.fillStyle = '#cfd3d7';
        ctx.fillText(profileData.title, infoX, infoStartY + 30);
      }
      

      // Booster badge
      try {
        const boosterRole = interaction.guild.roles.premiumSubscriberRole;
        const isBooster = Boolean(member.premiumSince) || (boosterRole && member.roles.cache.has(boosterRole.id));

        if (isBooster) {
          const prevFont = ctx.font;
          ctx.font = 'bold 48px "Segoe UI"';
          const nameWidth = ctx.measureText(targetUser.username).width;
          ctx.font = prevFont;

          const size = 30;
          const padding = 14;
          const bx = Math.round(infoX + nameWidth + padding);
          const by = Math.round(infoStartY - 30);

          const grad = ctx.createLinearGradient(bx, by, bx + size, by + size);
          grad.addColorStop(0, '#ff73fa');
          grad.addColorStop(1, '#a16bff');
          ctx.fillStyle = grad;
          ctx.beginPath();
          roundRect(ctx, bx, by, size, size, 12);
          ctx.fill();

          const boosterIcon = (cfg.profileCard && cfg.profileCard.boosterIcon) || null;
          let drewIcon = false;
          if (boosterIcon) {
            const buf = await resolveBadgeIcon(boosterIcon);
            if (buf) {
              try {
                const img = await loadImage(buf);
                ctx.save();
                roundRect(ctx, bx + 4, by + 4, size - 8, size - 8, 8);
                ctx.clip();
                ctx.drawImage(img, bx + 4, by + 4, size - 8, size - 8);
                ctx.restore();
                drewIcon = true;
              } catch {}
            }
          }
          if (!drewIcon) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px "Segoe UI"';
            ctx.textAlign = 'center';
            ctx.fillText('🚀', bx + size / 2, by + size / 2 + 6); // fallback visible
            ctx.textAlign = 'left';
          }
        }
      } catch {}

      const badgeY = infoStartY + (profileData.title ? 70 : 60);

      // RANK
      ctx.fillStyle = '#ff6b6b';
      roundRect(ctx, infoX, badgeY, 160, 55, 14);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 24px "Segoe UI"';
      ctx.textAlign = 'center';
      ctx.fillText(`RANK #${rank}`, infoX + 80, badgeY + 35);

      // LEVEL
      ctx.fillStyle = '#4ecdc4';
      roundRect(ctx, infoX + 180, badgeY, 160, 55, 14);
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.fillText(`LEVEL ${userData.level}`, infoX + 260, badgeY + 35);
      ctx.textAlign = 'left';

      // Estadísticas
      const rowY = badgeY + 85;
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '20px "Segoe UI"';

      const messages = userData.messages || 0;
      const voiceSeconds = userData.voiceTime || 0;
      const voiceMinutes = Math.floor(voiceSeconds / 60);
      const voiceHours = Math.floor(voiceMinutes / 60);
      const voiceRemainder = voiceMinutes % 60;

      const voiceX = infoX + 250;
      ctx.fillText(`Mensajes: ${messages}`, infoX, rowY);
      const voiceText = `Voz: ${voiceHours}h ${voiceRemainder}m`;
      ctx.fillText(voiceText, voiceX, rowY);

      const barYRef = panelY + panelH - 60;

      // Insignias
      const iconSize = CFG_BADGE_SIZE;
      const iconGap = CFG_BADGE_GAP;
      const voiceWidth = ctx.measureText(voiceText).width;

      let startX;
      if (CFG_BADGES_START_X !== null && Number.isFinite(CFG_BADGES_START_X)) {
        startX = CFG_BADGES_START_X + CFG_BADGES_X_OFFSET;
      } else {
        startX = Math.floor(voiceX + voiceWidth + 16 + CFG_BADGES_X_OFFSET);
      }

      const rightLimit = panelX + panelW - CFG_BADGES_RIGHT_MARGIN;
      const avail = Math.max(0, rightLimit - startX);
      const maxPerRow = Math.max(0, Math.floor((avail + iconGap) / (iconSize + iconGap)));

      const images = [];
      for (const bid of (profileData.equippedBadges || [])) {
        const badge = (profiles.badges || {})[bid];
        if (!badge?.icon) continue;
        try {
          const bbuf = await resolveBadgeIcon(badge.icon);
          if (!bbuf) continue;
          const bimg = await loadImage(bbuf);
          images.push(bimg);
          if (images.length >= maxPerRow) break;
        } catch {}
      }

      let iconsY;
      if (CFG_BADGES_START_Y !== null && Number.isFinite(CFG_BADGES_START_Y)) {
        iconsY = CFG_BADGES_START_Y + CFG_BADGES_Y_OFFSET; // respetar Y fija + offset
      } else {
        iconsY = rowY - iconSize - 8 + CFG_BADGES_Y_OFFSET; // auto
        // solo limitar cuando es auto
        iconsY = Math.min(iconsY, barYRef - iconSize - 12);
      }

      if (images.length) {
        images.forEach((img, i) => {
          const x = startX + i * (iconSize + iconGap);
          ctx.save();
          roundRect(ctx, x, iconsY, iconSize, iconSize, 8);
          ctx.clip();
          ctx.drawImage(img, x, iconsY, iconSize, iconSize);
          ctx.restore();
        });
      }

      // Miembro desde
      const joinDate = member.joinedAt?.toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric'
      }) || '—';
      ctx.fillStyle = '#b0b0b0';
      ctx.font = '18px "Segoe UI"';
      const joinY = (panelY + panelH - 60) - 14;
      ctx.fillText(`Miembro desde: ${joinDate}`, infoX, joinY);

      // Barra XP
      const barX = panelX + 50;
      const barY = panelY + panelH - 60;
      const barW = panelW - 100;
      const barH = 35;

      ctx.fillStyle = '#1a1a2e';
      roundRect(ctx, barX, barY, barW, barH, barH / 2);
      ctx.fill();

      const fillW = Math.max(0, Math.min(1, userData.xp / need)) * barW;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, up.accent || '#e94560');
        grad.addColorStop(1, '#ff6b6b');
        ctx.fillStyle = grad;
        roundRect(ctx, barX, barY, fillW, barH, barH / 2);
        ctx.fill();

        ctx.globalAlpha = 0.3;
        const shineGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH / 2);
        shineGrad.addColorStop(0, '#ffffff');
        shineGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shineGrad;
        roundRect(ctx, barX, barY, fillW, barH / 2, barH / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.font = 'bold 18px "Segoe UI"';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${userData.xp} / ${need} XP • ${percent}%`, barX + barW / 2, barY + 23);
      ctx.textAlign = 'left';

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'profile.png' });
      return interaction.editReply({ files: [attach] });
    } catch (err) {
      console.error('profile command error:', err);
      return interaction.editReply({ content: 'Error al generar el perfil' });
    }
  }
};