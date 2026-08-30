const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { readConfig } = require('../../utils/configCache');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');

// IMPORTA UTILIDADES DE NIVELES (reemplaza funciones locales)
const { readLevels, ensureUserData, xpToNext, getUserRank } = require('../../services/level').levelService;

// Descargar a Buffer (URL http/https)
async function fetchBuffer(url) {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://discord.com/'
    };
    const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e) {
    logger.error('[fetchBuffer]', e?.message || e);
    return null;
  }
}

// Resolver icono de insignia
async function resolveBadgeIcon(icon, size = 128) {
  if (!icon) return null;
  const m = String(icon).match(/^<a?:\w+:(\d+)>$/);
  if (m) {
    const id = m[1];
    const animated = String(icon).startsWith('<a:');
    const url = `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=${size}&quality=lossless`;
    return await fetchBuffer(url);
  }
  if (/^\d+$/.test(String(icon))) {
    const url = `https://cdn.discordapp.com/emojis/${icon}.png?size=${size}&quality=lossless`;
    return await fetchBuffer(url);
  }
  if (/^https?:\/\//i.test(String(icon))) return await fetchBuffer(icon);
  try {
    const localPath = path.isAbsolute(icon) ? icon : path.join(__dirname, '..', 'assets', 'badges', icon);
    return fs.readFileSync(localPath);
  } catch {
    return null;
  }
}

function getProfileBackgroundUrl(up) {
  if (!up) return null;
  const raw = up.bgUrl || up.backgroundUrl || up.background || up.bg || up.wallpaper || up.cardBg || null;
  if (!raw) return null;

  return normalizeExternalImageUrl(raw);
}

function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.width, ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const nw = iw * scale, nh = ih * scale;
  const cx = x + (w - nw) / 2, cy = y + (h - nh) / 2;
  ctx.drawImage(img, cx, cy, nw, nh);
}

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

function lightenHex(hex, amount = 0.25) {
  try {
    const h = String(hex || '#e94560').replace('#','');
    const n = parseInt(h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    const toHex = v => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return '#ff6b6b'; }
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
      // Permite slash y prefijo
      let targetUser = interaction.user;
      if (interaction.options && typeof interaction.options.getUser === 'function') {
        targetUser = interaction.options.getUser('usuario') || interaction.user;
      }
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply('❌ Usuario no encontrado.');

      const cfg = readConfig();
      const pcard = cfg.profileCard || {};
      
      // ✅ Control de escala/calidad desde config
      const SCALE = 1.4; // mantiene tu escala actual
      const DPI = Number(pcard.dpi) > 0 ? Number(pcard.dpi) : 1; // 1.5–2 para más nitidez
      const EMOJI_SIZE = Number(pcard.emojiSize) || 256; // 128/256/512
      const FEATURED_EMOJI_SIZE = Number(pcard.featuredEmojiSize) || EMOJI_SIZE;
      const SMOOTH = (pcard.smoothing === 'high' || pcard.smoothing === 'medium' || pcard.smoothing === 'low') 
        ? pcard.smoothing : 'high';

      const BASE_WIDTH = 1000;
      const BASE_HEIGHT = 400;
      const width = Math.floor(BASE_WIDTH * SCALE);
      const height = Math.floor(BASE_HEIGHT * SCALE);

      // ✅ Render a mayor DPI para mejor calidad
      const canvas = createCanvas(width * DPI, height * DPI);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = SMOOTH;
      ctx.scale(DPI, DPI);
      
      // Escalar configuraciones de badges
      const CFG_BADGE_SIZE = Math.floor((Number(pcard.badgeSize) || 60) * SCALE);
      const CFG_BADGE_GAP = Math.floor((Number(pcard.badgeGap) || 1) * SCALE);
      const CFG_BADGES_RIGHT_MARGIN = Math.floor((Number.isFinite(Number(pcard.badgesRightMargin)) ? Number(pcard.badgesRightMargin) : 50) * SCALE);
      const CFG_BADGES_X_OFFSET = Math.floor((Number(pcard.badgesXOffset) || 0) * SCALE);
      const CFG_BADGES_START_X = Number.isFinite(Number(pcard.badgesStartX)) ? Math.floor(Number(pcard.badgesStartX) * SCALE) : null;
      const CFG_BADGES_Y_OFFSET = Math.floor((Number(pcard.badgesYOffset) || 0) * SCALE);
      const CFG_BADGES_START_Y = Number.isFinite(Number(pcard.badgesStartY)) ? Math.floor(Number(pcard.badgesStartY) * SCALE) : null;

      // Featured badge escalado
      const CFG_FEAT_RIGHT_MARGIN = Math.floor((Number.isFinite(Number(pcard.featuredRightMargin)) ? Number(pcard.featuredRightMargin) : 35) * SCALE);
      const CFG_FEAT_ABOVE = Math.floor((Number.isFinite(Number(pcard.featuredAbove)) ? Number(pcard.featuredAbove) : 5) * SCALE);
      const CFG_FEAT_RADIUS = Math.floor((Number.isFinite(Number(pcard.featuredRadius)) ? Number(pcard.featuredRadius) : 10) * SCALE);
      const CFG_FEAT_SIZE = Number.isFinite(Number(pcard.featuredSize)) ? Math.floor(Number(pcard.featuredSize) * SCALE) : null;
      const CFG_FEAT_X = Number.isFinite(Number(pcard.featuredX)) ? Math.floor(Number(pcard.featuredX) * SCALE) : null;
      const CFG_FEAT_Y = Number.isFinite(Number(pcard.featuredY)) ? Math.floor(Number(pcard.featuredY) * SCALE) : null;

      const profiles = readProfiles();
      const userProfile = ensureUser(profiles, interaction.guildId, targetUser.id);

      const profileData = {
        title: userProfile.title || '',
        accent: userProfile.accent || '#e94560',
        bgUrl: userProfile.bgUrl || '',
        bgOpacity: typeof userProfile.bgOpacity === 'number' ? userProfile.bgOpacity : 0.7,
        equippedBadges: userProfile.equippedBadges || [],
        earnedBadges: userProfile.earnedBadges || [],
        streakDays: userProfile.streakDays || 0,
        lastActiveDay: userProfile.lastActiveDay || 0,
        dailyStreak: userProfile.dailyStreak || 0,
        lastDailyDay: userProfile.lastDailyDay || 0
      };

      const featuredBadgeId = userProfile.featuredBadge;
      const featuredBadge = featuredBadgeId ? profiles.badges?.[featuredBadgeId] : null;

      const equippedBadgesIds = (profileData.equippedBadges || [])
        .filter(id => id !== featuredBadgeId)
        .slice(0, 5);
      
      const equippedBadges = equippedBadgesIds
        .map(id => profiles.badges?.[id])
        .filter(Boolean);

      const levels = readLevels();
      const userData = ensureUserData(levels, interaction.guildId, targetUser.id);
      const need = xpToNext(userData.level || 0);
      const percent = need > 0 ? Math.floor((userData.xp || 0) / need * 100) : 0;
      const rank = getUserRank(interaction.guildId, targetUser.id, levels) || '—';


      // ✅ Escalar fuentes y elementos
      const pad = Math.floor(20 * SCALE);
      const panelX = pad, panelY = pad;
      const panelW = width - pad * 2, panelH = height - pad * 2;

      // Fondo base
      const bgGradient = ctx.createLinearGradient(0, 0, width, height);
      bgGradient.addColorStop(0, '#172842');
      bgGradient.addColorStop(1, '#0f2742');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#0f3460dd';
      roundRect(ctx, panelX, panelY, panelW, panelH, Math.floor(20 * SCALE));
      ctx.fill();

      const userBgUrl = getProfileBackgroundUrl(profileData);
      if (userBgUrl) {
        const buf = await fetchBuffer(userBgUrl);
        if (buf) {
          try {
            const bgImg = await loadImage(buf);
            ctx.save();
            const opacity = Number(profileData.bgOpacity);
            ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.7;
            roundRect(ctx, panelX, panelY, panelW, panelH, Math.floor(20 * SCALE));
            ctx.clip();
            drawImageCover(ctx, bgImg, panelX, panelY, panelW, panelH);
            ctx.restore();
          } catch (e) {
            logger.warn('[profile] Background error:', e?.message || e);
          }
        }
      }

      ctx.strokeStyle = profileData.accent || '#e94560';
      ctx.lineWidth = Math.floor(3 * SCALE);
      roundRect(ctx, panelX, panelY, panelW, panelH, Math.floor(20 * SCALE));
      ctx.stroke();

      // Avatar escalado
      const avSize = Math.floor(180 * SCALE);
      const avX = Math.floor(panelX + 50 * SCALE);
      const avY = Math.floor(panelY + 50 * SCALE);
      const avUrl = targetUser.displayAvatarURL({ extension: 'png', size: 512 }); // Mayor resolución
      const avBuf = await fetchBuffer(avUrl);
      if (avBuf) {
        const img = await loadImage(avBuf);
        const accent = profileData.accent || '#e94560';
        const accentLight = lightenHex(accent, 0.3);
        const avatarGrad = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
        avatarGrad.addColorStop(0, accent);
        avatarGrad.addColorStop(1, accentLight);
        ctx.beginPath();
        ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + Math.floor(6 * SCALE), 0, Math.PI * 2);
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

      // Streak escalado
      const streakDays = profileData.streakDays || 0;
      const tz = cfg.timezone || 0;
      const today = Math.floor((Date.now() + tz * 3600000) / 86400000);
      const lastActive = profileData.lastActiveDay || 0;
      const isStreakActive = lastActive >= today - 1;

      const rawIcon = (pcard.streakIcon || '🔥').trim();
      const STREAK_OFFSET_Y = Math.floor((Number(pcard.streakOffsetY) || 30) * SCALE);
      const STREAK_WIDTH = Math.floor(130 * SCALE);
      const STREAK_HEIGHT = Math.floor(48 * SCALE);

      if (streakDays > 0 && isStreakActive) {
        const streakCenterX = avX + avSize / 2;
        const streakY = avY + avSize + STREAK_OFFSET_Y;

        ctx.font = `bold ${Math.floor(16 * SCALE)}px "Segoe UI"`;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.textAlign = 'center';
        ctx.fillText('Racha activa', streakCenterX, streakY - Math.floor(10 * SCALE));
        ctx.textAlign = 'left';

        const streakGrad = ctx.createLinearGradient(
          streakCenterX - STREAK_WIDTH / 2,
          streakY - STREAK_HEIGHT / 2,
          streakCenterX + STREAK_WIDTH / 2,
          streakY + STREAK_HEIGHT / 2
        );
        streakGrad.addColorStop(0, '#ff6b6b');
        streakGrad.addColorStop(1, '#ff4757');
        ctx.fillStyle = streakGrad;
        roundRect(
          ctx,
          streakCenterX - STREAK_WIDTH / 2,
          streakY - STREAK_HEIGHT / 2,
          STREAK_WIDTH,
          STREAK_HEIGHT,
          Math.floor(18 * SCALE)
        );
        ctx.fill();

        const emoteMatch = rawIcon.match(/^<a?:\w+:(\d+)>$/);
        let iconDrawn = false;
        if (emoteMatch) {
          try {
            const emojiId = emoteMatch[1];
            const animated = rawIcon.startsWith('<a:');
            const url = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}?size=${EMOJI_SIZE}&quality=lossless`;
            const eBuf = await fetchBuffer(url);
            if (eBuf) {
              const eImg = await loadImage(eBuf);
              const iconSize = Math.floor(30 * SCALE);
              const iconX = streakCenterX - Math.floor(40 * SCALE);
              const iconY = streakY - iconSize / 2;
              ctx.save();
              roundRect(ctx, iconX, iconY, iconSize, iconSize, Math.floor(8 * SCALE));
              ctx.clip();
              ctx.drawImage(eImg, iconX, iconY, iconSize, iconSize);
              ctx.restore();
              iconDrawn = true;
              ctx.font = `bold ${Math.floor(24 * SCALE)}px "Segoe UI"`;
              ctx.fillStyle = '#ffffff';
              ctx.textAlign = 'left';
              ctx.fillText(String(streakDays), iconX + iconSize + Math.floor(10 * SCALE), streakY + Math.floor(8 * SCALE));
              ctx.textAlign = 'left';
            }
          } catch {}
        }

        if (!iconDrawn) {
          ctx.font = `bold ${Math.floor(24 * SCALE)}px "Segoe UI"`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.fillText(`${rawIcon} ${streakDays}`, streakCenterX, streakY + Math.floor(8 * SCALE));
          ctx.textAlign = 'left';
        }
      }

      // Info escalada
      const infoX = Math.floor(avX + avSize + 60 * SCALE);
      const infoStartY = Math.floor(panelY + 70 * SCALE);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.floor(48 * SCALE)}px "Segoe UI"`;
      ctx.fillText(targetUser.username, infoX, infoStartY);

      if (profileData.title) {
        ctx.font = `${Math.floor(22 * SCALE)}px "Segoe UI"`;
        ctx.fillStyle = '#cfd3d7';
        ctx.fillText(profileData.title, infoX, infoStartY + Math.floor(30 * SCALE));
      }

      // Booster badge escalado
      try {
        if (isBooster) {
          const prevFont = ctx.font;
          ctx.font = `bold ${Math.floor(48 * SCALE)}px "Segoe UI"`;
          const nameWidth = ctx.measureText(targetUser.username).width;
          ctx.font = prevFont;
          const size = Math.floor(30 * SCALE);
          const padding = Math.floor(14 * SCALE);
          const bx = Math.round(infoX + nameWidth + padding);
          const by = Math.round(infoStartY - Math.floor(30 * SCALE));
          const grad = ctx.createLinearGradient(bx, by, bx + size, by + size);
          grad.addColorStop(0, '#ff73fa');
          grad.addColorStop(1, '#a16bff');
          ctx.fillStyle = grad;
          roundRect(ctx, bx, by, size, size, Math.floor(12 * SCALE));
          ctx.fill();
          const boosterIcon = pcard.boosterIcon || null;
          let drewIcon = false;
          if (boosterIcon) {
            const buf = await resolveBadgeIcon(boosterIcon, EMOJI_SIZE);
            if (buf) {
              const img = await loadImage(buf);
              ctx.save();
              roundRect(ctx, bx + Math.floor(4 * SCALE), by + Math.floor(4 * SCALE), size - Math.floor(8 * SCALE), size - Math.floor(8 * SCALE), Math.floor(8 * SCALE));
              ctx.clip();
              ctx.drawImage(img, bx + Math.floor(4 * SCALE), by + Math.floor(4 * SCALE), size - Math.floor(8 * SCALE), size - Math.floor(8 * SCALE));
              ctx.restore();
              drewIcon = true;
            }
          }
          if (!drewIcon) {
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.floor(18 * SCALE)}px "Segoe UI"`;
            ctx.textAlign = 'center';
            ctx.fillText('🚀', bx + size / 2, by + size / 2 + Math.floor(6 * SCALE));
            ctx.textAlign = 'left';
          }
        }
      } catch {}

      const badgeY = Math.floor(infoStartY + (profileData.title ? 70 : 60) * SCALE);

      // RANK escalado
      ctx.fillStyle = '#ff6b6b';
      roundRect(ctx, infoX, badgeY, Math.floor(160 * SCALE), Math.floor(55 * SCALE), Math.floor(14 * SCALE));
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.floor(24 * SCALE)}px "Segoe UI"`;
      ctx.textAlign = 'center';
      ctx.fillText(`RANK #${rank}`, infoX + Math.floor(80 * SCALE), badgeY + Math.floor(35 * SCALE));

      // LEVEL escalado
      ctx.fillStyle = '#4ecdc4';
      roundRect(ctx, infoX + Math.floor(180 * SCALE), badgeY, Math.floor(160 * SCALE), Math.floor(55 * SCALE), Math.floor(14 * SCALE));
      ctx.fill();
      ctx.fillStyle = '#000000';
      ctx.fillText(`NIVEL ${userData.level || 0}`, infoX + Math.floor(260 * SCALE), badgeY + Math.floor(35 * SCALE));
      ctx.textAlign = 'left';

      // Estadísticas escaladas
      const rowY = Math.floor(badgeY + 85 * SCALE);
      ctx.fillStyle = '#e0e0e0';
      ctx.font = `${Math.floor(20 * SCALE)}px "Segoe UI"`;
      const messages = userData.messages || 0;
      const voiceMs = Number(userData.voiceMs || 0);
      const voiceMinutes = Math.floor(voiceMs / 60000);
      const voiceHours = Math.floor(voiceMinutes / 60);
      const voiceRemainder = voiceMinutes % 60;
      const voiceX = Math.floor(infoX + 200 * SCALE);
      ctx.fillText(`Mensajes: ${messages}`, infoX, rowY);
      const voiceText = `Voz: ${voiceHours}h ${voiceRemainder}m`;
      ctx.fillText(voiceText, voiceX, rowY);

      const barYRef = Math.floor(panelY + panelH - 60 * SCALE);

      // Insignias escaladas
      const iconSize = CFG_BADGE_SIZE;
      const iconGap = CFG_BADGE_GAP;
      const voiceWidth = ctx.measureText(voiceText).width;
      let startX;
      if (CFG_BADGES_START_X !== null && Number.isFinite(CFG_BADGES_START_X)) {
        startX = CFG_BADGES_START_X + CFG_BADGES_X_OFFSET;
      } else {
        startX = Math.floor(voiceX + voiceWidth + 16 * SCALE + CFG_BADGES_X_OFFSET);
      }
      const rightLimit = panelX + panelW - CFG_BADGES_RIGHT_MARGIN;
      const avail = Math.max(0, rightLimit - startX);
      const maxPerRow = Math.max(0, Math.floor((avail + iconGap) / (iconSize + iconGap)));
      const images = [];
      for (const bid of equippedBadgesIds) {
        const badge = profiles.badges?.[bid];
        if (!badge?.icon) continue;
        try {
          const bbuf = await resolveBadgeIcon(badge.icon, EMOJI_SIZE);
          if (!bbuf) continue;
          const bimg = await loadImage(bbuf);
          images.push(bimg);
          if (images.length >= maxPerRow) break;
        } catch {}
      }
      let iconsY;
      if (CFG_BADGES_START_Y !== null && Number.isFinite(CFG_BADGES_START_Y)) {
        iconsY = CFG_BADGES_START_Y + CFG_BADGES_Y_OFFSET;
      } else {
        iconsY = Math.floor(rowY - iconSize - 8 * SCALE + CFG_BADGES_Y_OFFSET);
        iconsY = Math.min(iconsY, barYRef - iconSize - Math.floor(12 * SCALE));
      }
      if (images.length) {
        images.forEach((img, i) => {
          const x = startX + i * (iconSize + iconGap);
          ctx.save();
          roundRect(ctx, x, iconsY, iconSize, iconSize, Math.floor(8 * SCALE));
          ctx.clip();
          ctx.drawImage(img, x, iconsY, iconSize, iconSize);
          ctx.restore();
        });
      }

      // Badge destacado escalado
      if (featuredBadge) {
        try {
          const featSize = CFG_FEAT_SIZE || Math.max(Math.floor(64 * SCALE), iconSize + Math.floor(100 * SCALE));
          let fx = rightLimit - featSize - CFG_FEAT_RIGHT_MARGIN;
          let fy = iconsY - featSize - CFG_FEAT_ABOVE;
          if (CFG_FEAT_X !== null) fx = CFG_FEAT_X;
          if (CFG_FEAT_Y !== null) fy = CFG_FEAT_Y;

          const featBuf = await resolveBadgeIcon(featuredBadge.icon, FEATURED_EMOJI_SIZE);
          if (featBuf) {
            const featImg = await loadImage(featBuf);
            ctx.save();
            roundRect(ctx, fx, fy, featSize, featSize, CFG_FEAT_RADIUS);
            ctx.clip();
            ctx.drawImage(featImg, fx, fy, featSize, featSize);
            ctx.restore();
          } else {
            ctx.font = `bold ${Math.floor(featSize * 0.75)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(featuredBadge.icon || '🏅', fx + featSize / 2, fy + featSize / 2 + featSize * 0.30);
            ctx.textAlign = 'left';
          }
        } catch (e) {
          logger.warn('[profile] featured badge draw error:', e?.message);
        }
      }

      // Miembro desde escalado
      const joinDate = member.joinedAt?.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) || '—';
      ctx.fillStyle = '#b0b0b0';
      ctx.font = `${Math.floor(18 * SCALE)}px "Segoe UI"`;
      const joinY = Math.floor((panelY + panelH - 60 * SCALE) - 14 * SCALE);
      ctx.fillText(`Miembro desde: ${joinDate}`, infoX, joinY);

      // Barra XP escalada
      const barX = Math.floor(panelX + 50 * SCALE);
      const barY = Math.floor(panelY + panelH - 60 * SCALE);
      const barW = Math.floor(panelW - 100 * SCALE);
      const barH = Math.floor(35 * SCALE);
      ctx.fillStyle = '#1a1a2e';
      roundRect(ctx, barX, barY, barW, barH, barH / 2);
      ctx.fill();
      const fillW = Math.max(0, Math.min(1, (userData.xp || 0) / need)) * barW;
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, profileData.accent || '#e94560');
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
      ctx.font = `bold ${Math.floor(18 * SCALE)}px "Segoe UI"`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${userData.xp || 0} / ${need} XP • ${percent}%`, barX + barW / 2, barY + Math.floor(23 * SCALE));
      ctx.textAlign = 'left';

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'profile.png' });

      const isSelf = targetUser.id === (interaction.user?.id || interaction.author?.id);
      const components = [];
      if (isSelf) {
        components.push(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('profile_open_customizer')
              .setLabel('Personalizar Perfil')
              .setEmoji('🎨')
              .setStyle(ButtonStyle.Primary)
          )
        );
      }

      return interaction.editReply({ files: [attach], components });
    } catch (err) {
      logger.error('profile command error:', err);
      return interaction.editReply({ content: 'Error al generar el perfil' });
    }
  },
  // --- Permite uso con prefijo ---
  async executePrefix(message, args, client) {
    // Solo permite en servidores y si todo está definido
    if (!message.guild || !message.member || !message.author || !message.guild.id) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }

    // Buscar usuario objetivo: mención, id o nombre
    let targetUser = message.author;
    if (message.mentions.users.size > 0) {
      targetUser = message.mentions.users.first();
    } else if (args.length > 0) {
      // Buscar por ID o nombre
      const arg = args[0].replace(/[<@!>]/g, '');
      // Buscar por ID
      let user = message.guild.members.cache.get(arg)?.user;
      // Buscar por nombre de usuario (parcial)
      if (!user) {
        user = message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === arg.toLowerCase() ||
          m.user.tag.toLowerCase() === arg.toLowerCase()
        )?.user;
      }
      if (user) targetUser = user;
    }

    const fakeInteraction = {
      guild: message.guild,
      guildId: message.guild.id,
      user: targetUser,
      deferReply: async () => {},
      editReply: async (data) => message.reply(data),
      reply: async (data) => message.reply(data),
      channel: message.channel,
      member: message.member,
    };
    if (!fakeInteraction.user || !fakeInteraction.user.id) {
      return message.reply('❌ No se pudo obtener el usuario correctamente.');
    }
    await module.exports.execute(fakeInteraction, client);
  }
};