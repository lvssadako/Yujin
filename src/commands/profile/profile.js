const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { readConfig } = require('../../utils/configCache');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');
const { readLevels, ensureUserData, xpToNext, getUserRank } = require('../../services/level').levelService;
const { initFonts, FONT_FALLBACKS } = require('../../utils/canvasFontLoader');

initFonts();

// Descargar buffer de imagen de forma limpia y directa
async function fetchBuffer(url) {
  if (!url || typeof url !== 'string') return null;
  const targetUrl = url.trim();
  if (!/^https?:\/\//i.test(targetUrl)) return null;

  try {
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      logger.warn(`[fetchBuffer] HTTP ${res.status} para ${targetUrl}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (e) {
    logger.warn('[fetchBuffer] Error:', e?.message || e);
    return null;
  }
}

// Resolver icono de insignia (Discord custom emoji, snowflake ID, URL directa o archivo)
async function resolveBadgeIcon(icon, size = 128) {
  if (!icon) return null;
  const str = String(icon).trim();

  // 1. Emoji personalizado de Discord: <:name:id> o <a:name:id>
  const match = str.match(/<a?:[a-zA-Z0-9_~-]+:(\d+)>/);
  if (match) {
    const emojiId = match[1];
    const url = `https://cdn.discordapp.com/emojis/${emojiId}.png?size=${size}`;
    const buf = await fetchBuffer(url);
    if (buf) return buf;
    try {
      return await loadImage(url);
    } catch {}
  }

  // 2. Solo Snowflake ID numérico de Discord
  const idMatch = str.match(/^(\d{17,21})$/);
  if (idMatch) {
    const url = `https://cdn.discordapp.com/emojis/${idMatch[1]}.png?size=${size}`;
    const buf = await fetchBuffer(url);
    if (buf) return buf;
    try {
      return await loadImage(url);
    } catch {}
  }

  // 3. URL directa
  if (/^https?:\/\//i.test(str)) {
    const buf = await fetchBuffer(str);
    if (buf) return buf;
    try {
      return await loadImage(str);
    } catch {}
  }

  // 4. Archivo local
  try {
    const localPath = path.isAbsolute(str) ? str : path.join(__dirname, '..', '..', 'assets', 'badges', str);
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    const withExt = localPath.endsWith('.png') ? localPath : `${localPath}.png`;
    if (fs.existsSync(withExt)) return fs.readFileSync(withExt);
  } catch {}

  return null;
}

function getProfileBackgroundUrl(up) {
  if (!up) return null;
  const raw = up.bgUrl || up.backgroundUrl || up.background || up.bg || up.wallpaper || up.cardBg || null;
  if (!raw) return null;
  return normalizeExternalImageUrl(raw) || raw;
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
    const h = String(hex || '#e94560').replace('#', '');
    const n = parseInt(h, 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    const toHex = v => v.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  } catch { return '#ff6b6b'; }
}

function drawAutoScaledText(ctx, text, x, y, maxW, initialSize, weight = 'bold', fontFace = FONT_FALLBACKS) {
  let size = initialSize;
  ctx.font = `${weight} ${size}px ${fontFace}`;
  while (ctx.measureText(text).width > maxW && size > 16) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${fontFace}`;
  }
  ctx.fillText(text, x, y);
  return size;
}

module.exports = {
  name: 'profile',
  description: 'Muestra tu tarjeta de perfil visual',
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Muestra tu tarjeta de perfil visual')
    .addUserOption(o => o.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      let targetUser = interaction.user;
      if (interaction.options && typeof interaction.options.getUser === 'function') {
        targetUser = interaction.options.getUser('usuario') || interaction.user;
      } else if (interaction.targetUser) {
        targetUser = interaction.targetUser;
      }
      const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      if (!member) return interaction.editReply('❌ Usuario no encontrado en este servidor.');

      const cfg = readConfig();
      
      const SCALE = 1.4;
      const BASE_WIDTH = 1000;
      const BASE_HEIGHT = 400;
      const width = Math.floor(BASE_WIDTH * SCALE); // 1400
      const height = Math.floor(BASE_HEIGHT * SCALE); // 560

      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const profiles = readProfiles();
      const userProfile = ensureUser(profiles, interaction.guildId, targetUser.id);

      const profileData = {
        title: userProfile.title || '',
        accent: userProfile.accent || '#e94560',
        barColor: userProfile.barColor || userProfile.accent || '#e94560',
        bgUrl: userProfile.bgUrl || '',
        bgOpacity: typeof userProfile.bgOpacity === 'number' ? userProfile.bgOpacity : 0.75,
        equippedBadges: userProfile.equippedBadges || [],
        earnedBadges: userProfile.earnedBadges || [],
        streakDays: userProfile.streakDays || 0,
        lastActiveDay: userProfile.lastActiveDay || 0
      };

      const featuredBadgeId = userProfile.featuredBadge;
      const featuredBadge = featuredBadgeId ? profiles.badges?.[featuredBadgeId] : null;

      const equippedBadgesIds = (profileData.equippedBadges || [])
        .filter(id => id !== featuredBadgeId)
        .slice(0, 5);

      const levels = readLevels();
      const userData = ensureUserData(levels, interaction.guildId, targetUser.id);
      const need = xpToNext(userData.level || 0);
      const percent = need > 0 ? Math.floor((userData.xp || 0) / need * 100) : 0;
      const rank = getUserRank(interaction.guildId, targetUser.id, levels, interaction.guild) || '—';

      // Booster check
      const boosterRole = member.guild.roles.premiumSubscriberRole;
      const isBooster = Boolean(member.premiumSince) || Boolean(boosterRole && member.roles.cache.has(boosterRole.id));

      // Panel boundaries
      const pad = Math.floor(20 * SCALE);
      const panelX = pad, panelY = pad;
      const panelW = width - pad * 2;
      const panelH = height - pad * 2;
      const radius = Math.floor(22 * SCALE);

      // 1. Fondo de lienzo
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(1, '#05070c');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Fondo del panel interior
      ctx.fillStyle = '#0d1526ee';
      roundRect(ctx, panelX, panelY, panelW, panelH, radius);
      ctx.fill();

      // Wallpaper personalizado (Desde caché local ultrarrápido o descarga segura)
      const userBgUrl = getProfileBackgroundUrl(profileData);
      if (userBgUrl) {
        try {
          const { getUserProfileBackgroundBuffer } = require('../../services/image/imageService');
          const buf = await getUserProfileBackgroundBuffer(interaction.guildId, targetUser.id, userBgUrl);
          if (buf) {
            const bgImg = await loadImage(buf);
            if (bgImg) {
              ctx.save();
              const opacity = Number(profileData.bgOpacity);
              ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0.1, Math.min(1, opacity)) : 0.75;
              roundRect(ctx, panelX, panelY, panelW, panelH, radius);
              ctx.clip();
              drawImageCover(ctx, bgImg, panelX, panelY, panelW, panelH);
              ctx.restore();
            }
          }
        } catch (e) {
          logger.warn('[profile] Background error:', e?.message || e);
        }
      }

      // Borde del panel con brillo acento
      ctx.save();
      ctx.strokeStyle = profileData.accent;
      ctx.lineWidth = Math.floor(3 * SCALE);
      ctx.shadowColor = profileData.accent;
      ctx.shadowBlur = Math.floor(10 * SCALE);
      roundRect(ctx, panelX, panelY, panelW, panelH, radius);
      ctx.stroke();
      ctx.restore();

      // 3. Columna izquierda: Avatar
      const avSize = Math.floor(160 * SCALE); // 224px
      const avX = Math.floor(panelX + 36 * SCALE);
      const avY = Math.floor(panelY + 36 * SCALE);
      const avUrl = targetUser.displayAvatarURL({ extension: 'png', size: 512, forceStatic: true });

      let img = null;
      try {
        const avBuf = await fetchBuffer(avUrl);
        if (avBuf) {
          img = await loadImage(avBuf);
        } else {
          img = await loadImage(avUrl);
        }
      } catch (err) {
        logger.warn('[profile] Error cargando avatar:', err?.message);
      }

      if (img) {
        try {
          const accent = profileData.accent;
          const accentLight = lightenHex(accent, 0.35);

          // Anillo decorativo exterior
          const ringGrad = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
          ringGrad.addColorStop(0, accent);
          ringGrad.addColorStop(1, accentLight);

          ctx.save();
          ctx.beginPath();
          ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + Math.floor(5 * SCALE), 0, Math.PI * 2);
          ctx.fillStyle = ringGrad;
          ctx.shadowColor = accent;
          ctx.shadowBlur = Math.floor(8 * SCALE);
          ctx.fill();
          ctx.restore();

          // Imagen circular
          ctx.save();
          ctx.beginPath();
          ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, avX, avY, avSize, avSize);
          ctx.restore();
        } catch {}
      }

      // 4. Píldora de Racha (Debajo del Avatar)
      const streakDays = profileData.streakDays || 0;
      const tz = cfg.timezone || 0;
      const today = Math.floor((Date.now() + tz * 3600000) / 86400000);
      const lastActive = profileData.lastActiveDay || 0;
      const isStreakActive = lastActive >= today - 1 && streakDays > 0;

      const streakCenterX = avX + avSize / 2;
      const streakY = avY + avSize + Math.floor(32 * SCALE);
      const STREAK_WIDTH = Math.floor(140 * SCALE);
      const STREAK_HEIGHT = Math.floor(40 * SCALE);

      if (isStreakActive) {
        const streakGrad = ctx.createLinearGradient(
          streakCenterX - STREAK_WIDTH / 2,
          streakY - STREAK_HEIGHT / 2,
          streakCenterX + STREAK_WIDTH / 2,
          streakY + STREAK_HEIGHT / 2
        );
        streakGrad.addColorStop(0, '#ff4757');
        streakGrad.addColorStop(1, '#ff6b81');

        ctx.save();
        ctx.fillStyle = streakGrad;
        ctx.shadowColor = 'rgba(255, 71, 87, 0.4)';
        ctx.shadowBlur = Math.floor(8 * SCALE);
        roundRect(ctx, streakCenterX - STREAK_WIDTH / 2, streakY - STREAK_HEIGHT / 2, STREAK_WIDTH, STREAK_HEIGHT, Math.floor(20 * SCALE));
        ctx.fill();
        ctx.restore();

        ctx.font = `bold ${Math.floor(16 * SCALE)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(`${streakDays} ${streakDays === 1 ? 'DÍA RACHA' : 'DÍAS RACHA'}`, streakCenterX, streakY + Math.floor(6 * SCALE));
        ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        roundRect(ctx, streakCenterX - STREAK_WIDTH / 2, streakY - STREAK_HEIGHT / 2, STREAK_WIDTH, STREAK_HEIGHT, Math.floor(20 * SCALE));
        ctx.fill();

        ctx.font = `600 ${Math.floor(14 * SCALE)}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = 'center';
        ctx.fillText('SIN RACHA', streakCenterX, streakY + Math.floor(5 * SCALE));
        ctx.textAlign = 'left';
      }

      // 5. Columna derecha: Información del Usuario
      const infoX = Math.floor(avX + avSize + 40 * SCALE);
      const infoStartY = Math.floor(panelY + 48 * SCALE);
      const rightAreaLimit = panelX + panelW - Math.floor(40 * SCALE);
      const maxNameWidth = (featuredBadge ? rightAreaLimit - 150 * SCALE : rightAreaLimit) - infoX - (isBooster ? 130 * SCALE : 0);

      // Nombre del usuario dentro del servidor (Server display name / nickname)
      const serverDisplayName = member?.displayName || targetUser.displayName || targetUser.globalName || targetUser.username;
      ctx.fillStyle = '#ffffff';
      const actualNameSize = drawAutoScaledText(ctx, serverDisplayName, infoX, infoStartY, maxNameWidth, Math.floor(38 * SCALE), 'bold');
      const nameWidth = ctx.measureText(serverDisplayName).width;

      // Badge de Booster si aplica
      if (isBooster) {
        const bW = Math.floor(100 * SCALE);
        const bH = Math.floor(26 * SCALE);
        const bx = Math.floor(infoX + nameWidth + 14 * SCALE);
        const by = Math.floor(infoStartY - actualNameSize * 0.75);

        const boosterGrad = ctx.createLinearGradient(bx, by, bx + bW, by + bH);
        boosterGrad.addColorStop(0, '#f47fff');
        boosterGrad.addColorStop(1, '#9b59b6');

        ctx.save();
        ctx.fillStyle = boosterGrad;
        roundRect(ctx, bx, by, bW, bH, Math.floor(13 * SCALE));
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(12 * SCALE)}px ${FONT_FALLBACKS}`;
        ctx.textAlign = 'center';
        ctx.fillText('BOOSTER', bx + bW / 2, by + Math.floor(18 * SCALE));
        ctx.textAlign = 'left';
        ctx.restore();
      }

      // Título / Lema
      let nextY = infoStartY + Math.floor(10 * SCALE);
      if (profileData.title) {
        nextY += Math.floor(24 * SCALE);
        ctx.font = `italic ${Math.floor(18 * SCALE)}px ${FONT_FALLBACKS}`;
        ctx.fillStyle = '#cbd5e1';
        const cleanTitle = profileData.title.length > 35 ? profileData.title.slice(0, 32) + '...' : profileData.title;
        ctx.fillText(`“${cleanTitle}”`, infoX, nextY);
      }

      // 6. Tarjetas de Rank y Nivel (Glassmorphism moderno)
      const badgeCardsY = nextY + Math.floor(22 * SCALE);
      const cardW = Math.floor(145 * SCALE);
      const cardH = Math.floor(46 * SCALE);
      const cardRadius = Math.floor(12 * SCALE);

      // Card Rank
      ctx.save();
      ctx.fillStyle = 'rgba(255, 75, 100, 0.15)';
      roundRect(ctx, infoX, badgeCardsY, cardW, cardH, cardRadius);
      ctx.fill();
      ctx.strokeStyle = '#ff4b64';
      ctx.lineWidth = Math.floor(2 * SCALE);
      roundRect(ctx, infoX, badgeCardsY, cardW, cardH, cardRadius);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.floor(18 * SCALE)}px ${FONT_FALLBACKS}`;
      ctx.textAlign = 'center';
      ctx.fillText(`RANK #${rank}`, infoX + cardW / 2, badgeCardsY + Math.floor(29 * SCALE));
      ctx.restore();

      // Card Level
      const lvlCardX = infoX + cardW + Math.floor(16 * SCALE);
      ctx.save();
      ctx.fillStyle = 'rgba(78, 205, 196, 0.15)';
      roundRect(ctx, lvlCardX, badgeCardsY, cardW, cardH, cardRadius);
      ctx.fill();
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = Math.floor(2 * SCALE);
      roundRect(ctx, lvlCardX, badgeCardsY, cardW, cardH, cardRadius);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.floor(18 * SCALE)}px ${FONT_FALLBACKS}`;
      ctx.textAlign = 'center';
      ctx.fillText(`NIVEL ${userData.level || 0}`, lvlCardX + cardW / 2, badgeCardsY + Math.floor(29 * SCALE));
      ctx.restore();

      // 7. Estadísticas del usuario
      const statsY = badgeCardsY + cardH + Math.floor(32 * SCALE);
      ctx.font = `600 ${Math.floor(17 * SCALE)}px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#e2e8f0';

      const messages = (userData.messages || 0).toLocaleString();
      const voiceMs = Number(userData.voiceMs || 0);
      const voiceMinutes = Math.floor(voiceMs / 60000);
      const voiceHours = Math.floor(voiceMinutes / 60);
      const voiceRemainder = voiceMinutes % 60;
      const voiceText = `${voiceHours}h ${voiceRemainder}m`;

      ctx.fillText(`${messages} msgs`, infoX, statsY);
      const msgsWidth = ctx.measureText(`${messages} msgs`).width;
      ctx.fillText(`•   ${voiceText} en voz`, infoX + msgsWidth + Math.floor(20 * SCALE), statsY);

      // Fecha de ingreso
      const joinDate = member.joinedAt?.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' }) || '—';
      ctx.font = `500 ${Math.floor(15 * SCALE)}px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Miembro desde: ${joinDate}`, infoX, statsY + Math.floor(26 * SCALE));

      // 8. Insignias Equipadas (Bandeja dedicada con ranuras)
      const badgeSlotSize = Math.floor(46 * SCALE); // 64px
      const badgeSlotGap = Math.floor(10 * SCALE);
      const badgesTrayY = statsY + Math.floor(44 * SCALE);

      for (let i = 0; i < 5; i++) {
        const bx = infoX + i * (badgeSlotSize + badgeSlotGap);
        // Slot placeholder
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = Math.floor(1.5 * SCALE);
        roundRect(ctx, bx, badgesTrayY, badgeSlotSize, badgeSlotSize, Math.floor(10 * SCALE));
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Icono si está equipado
        const badgeId = equippedBadgesIds[i];
        if (badgeId) {
          const badgeObj = profiles.badges?.[badgeId];
          if (badgeObj?.icon) {
            try {
              const bAsset = await resolveBadgeIcon(badgeObj.icon, 128);
              if (bAsset) {
                const bImg = (bAsset instanceof Buffer || Buffer.isBuffer(bAsset)) ? await loadImage(bAsset) : bAsset;
                if (bImg) {
                  ctx.save();
                  roundRect(ctx, bx + 2, badgesTrayY + 2, badgeSlotSize - 4, badgeSlotSize - 4, Math.floor(8 * SCALE));
                  ctx.clip();
                  ctx.drawImage(bImg, bx + 2, badgesTrayY + 2, badgeSlotSize - 4, badgeSlotSize - 4);
                  ctx.restore();
                }
              }
            } catch (err) {
              logger.warn(`[profile] Error cargando insignia ${badgeId}:`, err?.message);
            }
          }
        }
      }

      // 9. Insignia Destacada (Esquina superior derecha)
      if (featuredBadge) {
        try {
          const featSize = Math.floor(75 * SCALE); // 105px
          const fx = panelX + panelW - featSize - Math.floor(36 * SCALE);
          const fy = panelY + Math.floor(36 * SCALE);

          // Marco decorativo dorado
          ctx.save();
          ctx.fillStyle = 'rgba(255, 215, 0, 0.1)';
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = Math.floor(2.5 * SCALE);
          ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
          ctx.shadowBlur = Math.floor(10 * SCALE);
          roundRect(ctx, fx, fy, featSize, featSize, Math.floor(16 * SCALE));
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          const fAsset = await resolveBadgeIcon(featuredBadge.icon, 256);
          if (fAsset) {
            const fImg = (fAsset instanceof Buffer || Buffer.isBuffer(fAsset)) ? await loadImage(fAsset) : fAsset;
            if (fImg) {
              ctx.save();
              roundRect(ctx, fx + 4, fy + 4, featSize - 8, featSize - 8, Math.floor(12 * SCALE));
              ctx.clip();
              ctx.drawImage(fImg, fx + 4, fy + 4, featSize - 8, featSize - 8);
              ctx.restore();
            }
          }

          // Etiqueta "DESTACADA"
          const tagW = Math.floor(70 * SCALE);
          const tagH = Math.floor(18 * SCALE);
          ctx.fillStyle = '#ffd700';
          roundRect(ctx, fx + (featSize - tagW) / 2, fy + featSize - tagH / 2, tagW, tagH, Math.floor(6 * SCALE));
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = `bold ${Math.floor(9 * SCALE)}px ${FONT_FALLBACKS}`;
          ctx.textAlign = 'center';
          ctx.fillText('DESTACADA', fx + featSize / 2, fy + featSize + Math.floor(3 * SCALE));
          ctx.textAlign = 'left';
        } catch (e) {
          logger.warn('[profile] featured badge error:', e?.message);
        }
      }

      // 10. Barra de Progreso de XP (En la parte inferior)
      const barX = Math.floor(panelX + 36 * SCALE);
      const barW = Math.floor(panelW - 72 * SCALE);
      const barH = Math.floor(32 * SCALE);
      const barY = Math.floor(panelY + panelH - barH - 24 * SCALE);

      // Fondo de la barra
      ctx.save();
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = Math.floor(2 * SCALE);
      roundRect(ctx, barX, barY, barW, barH, barH / 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Relleno de progreso
      const fillW = Math.max(0, Math.min(1, (userData.xp || 0) / (need || 1))) * barW;
      if (fillW > 0) {
        const barColor = profileData.barColor || profileData.accent;
        const fillGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
        fillGrad.addColorStop(0, barColor);
        fillGrad.addColorStop(1, lightenHex(barColor, 0.35));

        ctx.save();
        ctx.fillStyle = fillGrad;
        roundRect(ctx, barX, barY, fillW, barH, barH / 2);
        ctx.fill();

        // Brillo superior sutil
        const shineGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH / 2);
        shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = shineGrad;
        roundRect(ctx, barX, barY, fillW, barH / 2, barH / 4);
        ctx.fill();
        ctx.restore();
      }

      // Texto de progreso con sombra de alto contraste
      ctx.save();
      ctx.font = `bold ${Math.floor(16 * SCALE)}px ${FONT_FALLBACKS}`;
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = Math.floor(6 * SCALE);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.floor(1 * SCALE);
      ctx.textAlign = 'center';
      ctx.fillText(`${(userData.xp || 0).toLocaleString()} / ${need.toLocaleString()} XP • ${percent}%`, barX + barW / 2, barY + Math.floor(22 * SCALE));
      ctx.textAlign = 'left';
      ctx.restore();

      const buffer = canvas.toBuffer('image/png');
      const attach = new AttachmentBuilder(buffer, { name: 'profile.png' });

      const callerId = interaction.author?.id || interaction.user?.id;
      const isSelf = Boolean(callerId && targetUser.id === callerId);
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
      return interaction.editReply({ content: '❌ Error al generar la tarjeta de perfil' });
    }
  },

  async executePrefix(message, args, client) {
    if (!message.guild || !message.member || !message.author || !message.guild.id) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }

    let targetUser = message.author;
    if (message.mentions.users.size > 0) {
      targetUser = message.mentions.users.first();
    } else if (args.length > 0) {
      const arg = args[0].replace(/[<@!>]/g, '');
      let user = message.guild.members.cache.get(arg)?.user;
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
      user: message.author,
      author: message.author,
      targetUser: targetUser,
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
