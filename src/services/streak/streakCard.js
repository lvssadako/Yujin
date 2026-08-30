const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const logger = require('../../utils/logger');

async function fetchAvatarBuffer(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Avatar fetch error');
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
  ctx.arcTo(x, y + w, x, y, r);
  ctx.closePath();
}

async function generateStreakCard(user, status) {
  const width = 900;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const { streakDays, isActiveToday, currentTier, nextTier, progressPercent, daysToNext, freezersCount } = status;
  const tierColorHex = '#' + (currentTier.color ? currentTier.color.toString(16).padStart(6, '0') : 'ff6b6b');

  // 1. Fondo oscuro con gradiente suave
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#101118');
  bgGrad.addColorStop(0.5, '#161724');
  bgGrad.addColorStop(1, '#0e0f14');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, width, height, 28);
  ctx.fill();

  // 2. Borde exterior elegante
  ctx.strokeStyle = tierColorHex;
  ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, width - 4, height - 4, 28);
  ctx.stroke();

  // 3. Brillo de fuego ambiental en la esquina superior derecha
  const glowGrad = ctx.createRadialGradient(width - 100, 80, 10, width - 100, 80, 220);
  glowGrad.addColorStop(0, tierColorHex + '33');
  glowGrad.addColorStop(1, '#00000000');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // 4. Avatar del usuario
  const avSize = 140;
  const avX = 45;
  const avY = 45;

  let avatarLoaded = false;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256 });
    const avBuf = await fetchAvatarBuffer(avatarUrl);
    if (avBuf) {
      const img = await loadImage(avBuf);
      
      // Anillo exterior brillante
      ctx.beginPath();
      ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + 5, 0, Math.PI * 2);
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
    roundRect(ctx, avX, avY, avSize, avSize, 20);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 45px "Segoe UI", sans-serif';
    ctx.fillText('👤', avX + 45, avY + 90);
  }

  // 5. Nombre de usuario y Tag
  const textX = avX + avSize + 30;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 36px "Segoe UI", sans-serif';
  const usernameDisplay = user.username.length > 16 ? user.username.slice(0, 15) + '…' : user.username;
  ctx.fillText(usernameDisplay, textX, avY + 45);

  // Badge del Nivel de Fuego (Pastilla superior derecha)
  const tierName = `${currentTier.emoji} ${currentTier.name.toUpperCase()}`;
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  const tierTextWidth = ctx.measureText(tierName).width;
  const pillW = tierTextWidth + 30;
  const pillH = 34;
  const pillX = width - pillW - 45;
  const pillY = avY + 15;

  ctx.fillStyle = tierColorHex + '25';
  roundRect(ctx, pillX, pillY, pillW, pillH, 12);
  ctx.fill();
  ctx.strokeStyle = tierColorHex;
  ctx.lineWidth = 1.5;
  roundRect(ctx, pillX, pillY, pillW, pillH, 12);
  ctx.stroke();

  ctx.fillStyle = tierColorHex;
  ctx.fillText(tierName, pillX + 15, pillY + 23);

  // 6. Contador Gigante de Racha
  ctx.fillStyle = tierColorHex;
  ctx.font = '900 48px "Segoe UI", sans-serif';
  const streakCountText = `🔥 ${streakDays} DÍAS`;
  ctx.fillText(streakCountText, textX, avY + 105);

  // Estado del día (Pastilla debajo del contador)
  const statusX = textX + ctx.measureText(streakCountText).width + 20;
  const statusLabel = isActiveToday ? '🟢 PROTEGIDA HOY' : '⏳ PENDIENTE HOY';
  const statusColor = isActiveToday ? '#2ECC71' : '#F39C12';
  ctx.font = 'bold 14px "Segoe UI", sans-serif';
  const statusW = ctx.measureText(statusLabel).width + 24;
  
  if (statusX + statusW < width - 40) {
    ctx.fillStyle = statusColor + '20';
    roundRect(ctx, statusX, avY + 70, statusW, 30, 8);
    ctx.fill();
    ctx.fillStyle = statusColor;
    ctx.fillText(statusLabel, statusX + 12, avY + 90);
  }

  // 7. Fila de Beneficios (Píldoras informativas)
  const pillsY = 215;
  const bonusXp = Math.round((currentTier.xpMultiplier - 1) * 100);
  const perks = [
    { text: `⚡ +${bonusXp}% XP EXTRA`, color: '#F1C40F' },
    { text: `🛒 ${currentTier.shopDiscount > 0 ? `-${currentTier.shopDiscount}% TIENDA` : 'SIN DESC.'}`, color: '#E67E22' },
    { text: `🧊 ${freezersCount} CONGELADOR${freezersCount === 1 ? '' : 'ES'}`, color: '#3498DB' }
  ];

  let curPillX = 45;
  for (const perk of perks) {
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    const pw = ctx.measureText(perk.text).width + 26;
    ctx.fillStyle = '#1A1B28';
    roundRect(ctx, curPillX, pillsY, pw, 36, 10);
    ctx.fill();
    ctx.strokeStyle = perk.color + '66';
    ctx.lineWidth = 1;
    roundRect(ctx, curPillX, pillsY, pw, 36, 10);
    ctx.stroke();

    ctx.fillStyle = perk.color;
    ctx.fillText(perk.text, curPillX + 13, pillsY + 23);
    curPillX += pw + 15;
  }

  // 8. Barra de Progreso hacia el siguiente nivel
  const barX = 45;
  const barY = 290;
  const barW = width - 90;
  const barH = 22;

  // Fondo de la barra
  ctx.fillStyle = '#1A1B28';
  roundRect(ctx, barX, barY, barW, barH, 11);
  ctx.fill();

  // Relleno con degradado de fuego
  const fillW = Math.max(16, Math.min(barW, Math.round((progressPercent / 100) * barW)));
  const barGrad = ctx.createLinearGradient(barX, barY, barX + fillW, barY);
  barGrad.addColorStop(0, '#E67E22');
  barGrad.addColorStop(1, tierColorHex);
  ctx.fillStyle = barGrad;
  roundRect(ctx, barX, barY, fillW, barH, 11);
  ctx.fill();

  // Texto explicativo debajo de la barra
  const nextText = nextTier
    ? `Siguiente: ${nextTier.emoji} ${nextTier.name} (${progressPercent}%) · Faltan ${daysToNext} día${daysToNext === 1 ? '' : 's'} consecutivos`
    : '¡Has alcanzado la cima de las rachas de la comunidad!';

  ctx.fillStyle = '#A0A2B5';
  ctx.font = '15px "Segoe UI", sans-serif';
  ctx.fillText(nextText, barX, barY + 45);

  const footerRight = 'LCO Bot · Chatea a diario para subir de nivel';
  ctx.font = '14px "Segoe UI", sans-serif';
  const frW = ctx.measureText(footerRight).width;
  ctx.fillStyle = '#5A5C70';
  ctx.fillText(footerRight, width - frW - 45, barY + 45);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'streak-card.png' });
}

module.exports = { generateStreakCard };
