const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const logger = require('../../utils/logger');

// Strip emoji / symbol unicode codepoints that @napi-rs/canvas cannot render
// (there are no color-emoji fonts available server-side).
function stripEmoji(text) {
  return String(text)
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')   // Supplemental Symbols & Pictographs, Emoticons, etc.
    .replace(/[\u{2600}-\u{27BF}]/gu, '')      // Misc symbols, Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')      // Variation selectors
    .replace(/[\u{200D}]/gu, '')                // Zero-width joiner
    .replace(/[\u{20E3}]/gu, '')                // Combining enclosing keycap
    .replace(/[\u{E0020}-\u{E007F}]/gu, '')     // Tags
    .trim();
}

async function fetchAvatarBuffer(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      }
    });
    if (!res.ok) throw new Error('Fetch buffer error');
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
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.width, ih = img.height;
  const scale = Math.max(w / iw, h / ih);
  const nw = iw * scale, nh = ih * scale;
  const cx = x + (w - nw) / 2, cy = y + (h - nh) / 2;
  ctx.drawImage(img, cx, cy, nw, nh);
}

function drawFlameIcon(ctx, x, y, size, mainColor = '#FF4500') {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 32;
  ctx.scale(s, s);

  ctx.fillStyle = mainColor;
  ctx.beginPath();
  ctx.moveTo(16, 1);
  ctx.bezierCurveTo(19, 7, 27, 11, 27, 20);
  ctx.bezierCurveTo(27, 27, 22, 31, 16, 31);
  ctx.bezierCurveTo(10, 31, 5, 27, 5, 20);
  ctx.bezierCurveTo(5, 14, 10, 9, 12, 7);
  ctx.bezierCurveTo(12, 11, 14, 14, 16, 15);
  ctx.bezierCurveTo(16, 11, 15, 6, 16, 1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFEAA7';
  ctx.beginPath();
  ctx.moveTo(16, 13);
  ctx.bezierCurveTo(18.5, 16.5, 21.5, 19, 21.5, 23.5);
  ctx.bezierCurveTo(21.5, 27.5, 19, 29, 16, 29);
  ctx.bezierCurveTo(13, 29, 10.5, 27.5, 10.5, 23.5);
  ctx.bezierCurveTo(10.5, 20, 13.5, 16.5, 16, 13);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

async function generateStreakCard(user, status, botName = 'Bot') {
  const width = 900;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const {
    streakDays,
    isActiveToday,
    currentTier,
    nextTier,
    progressPercent,
    daysToNext,
    freezersCount,
    streakBgUrl,
    streakBgOpacity,
    streakAccent
  } = status;

  const tierColorHex = streakAccent || ('#' + (currentTier.color ? currentTier.color.toString(16).padStart(6, '0') : 'ff6b6b'));

  // 1. Fondo base degradado
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0F101A');
  bgGrad.addColorStop(0.5, '#151726');
  bgGrad.addColorStop(1, '#0B0C12');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, width, height, 24);
  ctx.fill();

  // 2. Imagen de fondo / Wallpaper personalizado (si está configurado)
  if (streakBgUrl) {
    try {
      const bgBuf = await fetchAvatarBuffer(streakBgUrl);
      if (bgBuf) {
        const bgImg = await loadImage(bgBuf);
        ctx.save();
        roundRect(ctx, 0, 0, width, height, 24);
        ctx.clip();
        drawImageCover(ctx, bgImg, 0, 0, width, height);

        // Capa oscura translúcida para garantizar legibilidad perfecta
        const opacity = typeof streakBgOpacity === 'number' ? streakBgOpacity : 0.65;
        const tintAlpha = Math.min(0.9, Math.max(0.2, 1 - opacity));
        ctx.fillStyle = `rgba(12, 13, 20, ${tintAlpha.toFixed(2)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    } catch (e) {
      logger.warn('[streakCard] Falló render de wallpaper de fondo:', e?.message);
    }
  }

  // 3. Borde exterior elegante
  ctx.strokeStyle = tierColorHex;
  ctx.lineWidth = 2.5;
  roundRect(ctx, 2, 2, width - 4, height - 4, 24);
  ctx.stroke();

  // 4. Brillo ambiental en la esquina superior derecha
  const glowGrad = ctx.createRadialGradient(width - 120, 70, 10, width - 120, 70, 260);
  glowGrad.addColorStop(0, tierColorHex + '25');
  glowGrad.addColorStop(1, '#00000000');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // 5. Avatar del usuario
  const avSize = 130;
  const avX = 45;
  const avY = 45;

  let avatarLoaded = false;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
    const avBuf = await fetchAvatarBuffer(avatarUrl);
    if (avBuf) {
      const img = await loadImage(avBuf);
      
      // Anillo exterior de nivel
      ctx.beginPath();
      ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 4, 0, Math.PI * 2);
      ctx.fillStyle = tierColorHex;
      ctx.fill();

      // Recorte circular del avatar
      ctx.save();
      ctx.beginPath();
      ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, avX, avY, avSize, avSize);
      ctx.restore();
      avatarLoaded = true;
    }
  } catch (err) {
    logger.warn('[streakCard] Falló render de avatar:', err?.message);
  }

  if (!avatarLoaded) {
    ctx.fillStyle = '#232433';
    roundRect(ctx, avX, avY, avSize, avSize, 18);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.fillText('AVATAR', avX + 15, avY + 75);
  }

  // 6. Nombre de usuario
  const textX = avX + avSize + 28;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px "Segoe UI", sans-serif';
  const usernameDisplay = user.username.length > 18 ? user.username.slice(0, 17) + '…' : user.username;
  ctx.fillText(usernameDisplay, textX, avY + 40);

  // Badge del Nivel de Fuego (Pastilla superior derecha)
  const tierLabel = stripEmoji(currentTier.name).toUpperCase();
  ctx.font = 'bold 15px "Segoe UI", sans-serif';
  const tierTextWidth = ctx.measureText(tierLabel).width;
  const pillW = tierTextWidth + 36;
  const pillH = 32;
  const pillX = width - pillW - 45;
  const pillY = avY + 12;

  ctx.fillStyle = tierColorHex + '28';
  roundRect(ctx, pillX, pillY, pillW, pillH, 10);
  ctx.fill();
  ctx.strokeStyle = tierColorHex;
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, 10);
  ctx.stroke();

  drawFlameIcon(ctx, pillX + 10, pillY + 7, 18, tierColorHex);
  ctx.fillStyle = tierColorHex;
  ctx.fillText(tierLabel, pillX + 30, pillY + 22);

  // 7. Contador Gigante de Racha con Llama Vectorial
  const flameSize = 44;
  drawFlameIcon(ctx, textX, avY + 68, flameSize, tierColorHex);

  ctx.fillStyle = tierColorHex;
  ctx.font = '900 44px "Segoe UI", sans-serif';
  const streakCountText = `${streakDays} ${streakDays === 1 ? 'DÍA' : 'DÍAS'}`;
  ctx.fillText(streakCountText, textX + flameSize + 8, avY + 106);

  // Pastilla de estado en vivo (Protegida / Pendiente)
  const statusX = textX + flameSize + 8 + ctx.measureText(streakCountText).width + 18;
  const statusLabel = isActiveToday ? 'PROTEGIDA HOY' : 'PENDIENTE HOY';
  const statusColor = isActiveToday ? '#2ECC71' : '#F39C12';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  const statusW = ctx.measureText(statusLabel).width + 30;
  const statusY = avY + 76;
  const statusH = 28;
  
  if (statusX + statusW < width - 40) {
    ctx.fillStyle = statusColor + '20';
    roundRect(ctx, statusX, statusY, statusW, statusH, 8);
    ctx.fill();
    ctx.strokeStyle = statusColor + '88';
    ctx.lineWidth = 1;
    roundRect(ctx, statusX, statusY, statusW, statusH, 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(statusX + 13, statusY + statusH / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = statusColor;
    ctx.fill();

    ctx.fillText(statusLabel, statusX + 22, statusY + 19);
  }

  // 8. Fila de Beneficios (Píldoras informativas estilizadas)
  const pillsY = 210;
  const bonusXp = Math.round((currentTier.xpMultiplier - 1) * 100);
  const perks = [
    { label: `+${bonusXp}% XP EXTRA`, color: '#F1C40F', dot: '#F1C40F' },
    { label: `${currentTier.shopDiscount > 0 ? `-${currentTier.shopDiscount}% TIENDA` : '0% TIENDA'}`, color: '#E67E22', dot: '#E67E22' },
    { label: `${freezersCount} CONGELADOR${freezersCount === 1 ? '' : 'ES'}`, color: '#3498DB', dot: '#3498DB' }
  ];

  let curPillX = 45;
  for (const perk of perks) {
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    const pw = ctx.measureText(perk.label).width + 32;
    const ph = 34;
    
    ctx.fillStyle = '#141624E6';
    roundRect(ctx, curPillX, pillsY, pw, ph, 8);
    ctx.fill();
    ctx.strokeStyle = perk.color + '55';
    ctx.lineWidth = 1;
    roundRect(ctx, curPillX, pillsY, pw, ph, 8);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(curPillX + 13, pillsY + ph / 2, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = perk.dot;
    ctx.fill();

    ctx.fillStyle = perk.color;
    ctx.fillText(perk.label, curPillX + 22, pillsY + 22);
    curPillX += pw + 14;
  }

  // 9. Barra de Progreso hacia el siguiente nivel
  const barX = 45;
  const barY = 280;
  const barW = width - 90;
  const barH = 20;

  // Fondo de la barra
  ctx.fillStyle = '#141624E6';
  roundRect(ctx, barX, barY, barW, barH, 10);
  ctx.fill();

  // Relleno de la barra
  const pct = Math.max(0, Math.min(100, progressPercent));
  const fillW = Math.max(pct > 0 ? 14 : 0, Math.round((pct / 100) * barW));
  if (fillW > 0) {
    const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
    barGrad.addColorStop(0, '#E67E22');
    barGrad.addColorStop(1, tierColorHex);
    ctx.fillStyle = barGrad;
    roundRect(ctx, barX, barY, fillW, barH, 10);
    ctx.fill();
  }

  // 10. Texto explicativo inferior
  const nextText = nextTier
    ? `Siguiente nivel: ${stripEmoji(nextTier.name).toUpperCase()} (${pct}%) · Faltan ${daysToNext} dia${daysToNext === 1 ? '' : 's'} consecutivos`
    : 'Has alcanzado el rango maximo de racha de la comunidad!';

  ctx.fillStyle = '#9FA3BC';
  ctx.font = '14px "Segoe UI", sans-serif';
  ctx.fillText(nextText, barX, barY + 42);

  const nameDisplay = botName || 'Bot';
  const footerRight = `${nameDisplay} · Chatea a diario para mantener tu fuego`;
  ctx.font = '13px "Segoe UI", sans-serif';
  const frW = ctx.measureText(footerRight).width;
  ctx.fillStyle = '#6E728B';
  ctx.fillText(footerRight, width - frW - 45, barY + 42);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'streak-card.png' });
}

module.exports = { generateStreakCard };
