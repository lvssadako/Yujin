const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const { initFonts, FONT_FALLBACKS } = require('../../utils/canvasFontLoader');

initFonts();
const FONT = String(FONT_FALLBACKS);
const COIN_ICON = path.join(__dirname, '..', '..', '..', 'assets', 'icons', 'coin.png');
const W = 900; const H = 340;

const stripEmoji = text => String(text || '')
  .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
const fmt = n => new Intl.NumberFormat('es-MX').format(Math.max(0, Math.floor(Number(n) || 0)));
const fit = (ctx, text, max) => { let t = text; while (t.length > 1 && ctx.measureText(t).width > max) t = t.slice(0, -1); return t === text ? t : t.trimEnd() + '…'; };

function flame(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); const s = size / 32; ctx.scale(s, s);
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(16, 1);
  ctx.bezierCurveTo(19, 7, 27, 11, 27, 20); ctx.bezierCurveTo(27, 27, 22, 31, 16, 31);
  ctx.bezierCurveTo(10, 31, 5, 27, 5, 20); ctx.bezierCurveTo(5, 14, 10, 9, 12, 7);
  ctx.bezierCurveTo(12, 11, 14, 14, 16, 15); ctx.bezierCurveTo(16, 11, 15, 6, 16, 1); ctx.fill();
  ctx.fillStyle = '#FFEAA7'; ctx.beginPath(); ctx.moveTo(16, 13);
  ctx.bezierCurveTo(18.5, 16.5, 21.5, 19, 21.5, 23.5); ctx.bezierCurveTo(21.5, 27.5, 19, 29, 16, 29);
  ctx.bezierCurveTo(13, 29, 10.5, 27.5, 10.5, 23.5); ctx.bezierCurveTo(10.5, 20, 13.5, 16.5, 16, 13); ctx.fill();
  ctx.restore();
}
function star(ctx, cx, cy, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const rr = i % 2 ? r * 0.45 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill();
}
function check(ctx, cx, cy, s, color) {
  ctx.strokeStyle = color; ctx.lineWidth = s * 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(cx - s * 0.45, cy); ctx.lineTo(cx - s * 0.1, cy + s * 0.35); ctx.lineTo(cx + s * 0.5, cy - s * 0.35); ctx.stroke();
}
const panel = (ctx, x, y, w, h, r = 18, fill = 'rgba(255,255,255,0.06)') => { ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };

/**
 * Posición de la racha dentro del ciclo semanal de 7 días.
 * done = casillas cumplidas (0-7). Si la recompensa de hoy aún no se cobró, la siguiente casilla es la "de hoy".
 */
function weekProgress(streak, claimedToday) {
  const s = Math.max(0, Math.floor(Number(streak) || 0));
  if (s === 0) return { done: 0, todayIndex: claimedToday ? -1 : 0 };
  const done = claimedToday ? ((s - 1) % 7) + 1 : s % 7;
  return { done, todayIndex: claimedToday ? -1 : done };
}

async function generateDailyCard({ user, avatarBuffer = null, streak = 0, canClaim = false, reward = 0, balance = {}, missions = [] }) {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const accent = canClaim ? '#6EE7B7' : '#A78BFA';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#13111f'); bg.addColorStop(0.6, '#1c1735'); bg.addColorStop(1, '#0e0c18');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 26); ctx.fill();
  ctx.save(); ctx.clip();
  const glow = ctx.createRadialGradient(W - 90, 40, 10, W - 90, 40, 320);
  glow.addColorStop(0, 'rgba(167,139,250,0.35)'); glow.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(40, H, 10, 40, H, 280);
  glow2.addColorStop(0, 'rgba(233,196,106,0.22)'); glow2.addColorStop(1, 'rgba(233,196,106,0)');
  ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H); ctx.restore();
  ctx.strokeStyle = accent; ctx.globalAlpha = 0.7; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, 26); ctx.stroke(); ctx.globalAlpha = 1;

  // Avatar + nombre
  const ax = 40; const ay = 36; const ar = 40;
  ctx.save(); ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); ctx.clip();
  try { if (avatarBuffer) ctx.drawImage(await loadImage(avatarBuffer), ax, ay, ar * 2, ar * 2); else throw new Error('sin avatar'); }
  catch { ctx.fillStyle = '#2b2550'; ctx.fillRect(ax, ay, ar * 2, ar * 2); }
  ctx.restore();
  ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar + 2, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#ffffff'; ctx.font = `bold 30px ${FONT}`;
  ctx.fillText(fit(ctx, stripEmoji(user?.displayName || user?.username) || 'Usuario', 360), 140, 70);
  ctx.fillStyle = '#A9A3C7'; ctx.font = `16px ${FONT}`; ctx.fillText('RECOMPENSAS DIARIAS', 142, 98);

  // Racha
  flame(ctx, 44, 142, 60, streak > 0 ? '#FF7A45' : '#5b5675');
  ctx.fillStyle = '#ffffff'; ctx.font = `bold 62px ${FONT}`; ctx.fillText(String(streak), 118, 192);
  const numW = ctx.measureText(String(streak)).width;
  ctx.fillStyle = '#A9A3C7'; ctx.font = `20px ${FONT}`; ctx.fillText(streak === 1 ? 'día de racha' : 'días de racha', 126 + numW, 190);

  // Tracker semanal
  const { done, todayIndex } = weekProgress(streak, !canClaim);
  for (let i = 0; i < 7; i++) {
    const cx = 66 + i * 70; const cy = 262; const r = 24;
    const isDone = i < done; const isToday = i === todayIndex; const last = i === 6;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = isDone ? accent : 'rgba(255,255,255,0.07)'; ctx.fill();
    if (isToday) { ctx.strokeStyle = '#FFE08A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
    if (isDone) check(ctx, cx, cy, 20, '#10231c');
    else if (last) star(ctx, cx, cy, 14, isToday ? '#FFE08A' : '#7d7699');
    else { ctx.fillStyle = isToday ? '#FFE08A' : '#7d7699'; ctx.font = `bold 18px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), cx, cy + 6); ctx.textAlign = 'left'; }
  }

  // Panel derecho: billetera, recompensa y misiones
  const px = 600; const pw = 270;
  panel(ctx, px, 30, pw, 280);
  let coin = null; try { coin = await loadImage(COIN_ICON); } catch { /* sin icono */ }
  if (coin) ctx.drawImage(coin, px + 20, 46, 54, 54);
  ctx.fillStyle = '#A9A3C7'; ctx.font = `15px ${FONT}`; ctx.fillText('BILLETERA', px + 86, 62);
  ctx.fillStyle = '#FFE08A'; ctx.font = `bold 32px ${FONT}`; ctx.fillText(fit(ctx, fmt(balance.coins), pw - 100), px + 86, 94);
  ctx.fillStyle = '#A9A3C7'; ctx.font = `15px ${FONT}`; ctx.fillText(`Banco  ${fmt(balance.bank)}`, px + 22, 128);

  // Recompensa
  ctx.fillStyle = canClaim ? 'rgba(110,231,183,0.18)' : 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(px + 18, 146, pw - 36, 56, 14); ctx.fill();
  if (canClaim) {
    ctx.fillStyle = '#6EE7B7'; ctx.font = `bold 28px ${FONT}`; ctx.fillText(`+${fmt(reward)}`, px + 34, 184);
    ctx.fillStyle = '#A9A3C7'; ctx.font = `14px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText('listo para cobrar', px + pw - 32, 184); ctx.textAlign = 'left';
  } else {
    check(ctx, px + 42, 174, 18, '#6EE7B7');
    ctx.fillStyle = '#ffffff'; ctx.font = `bold 18px ${FONT}`; ctx.fillText('Cobrado hoy', px + 66, 181);
  }

  const total = missions.length; const completed = missions.filter(m => m.completed).length;
  ctx.fillStyle = '#A9A3C7'; ctx.font = `15px ${FONT}`; ctx.fillText('MISIONES', px + 22, 238);
  ctx.fillStyle = '#ffffff'; ctx.font = `bold 15px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(`${completed}/${total}`, px + pw - 22, 238); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.roundRect(px + 22, 252, pw - 44, 14, 7); ctx.fill();
  const ratio = total ? completed / total : 0;
  if (ratio > 0) { ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(px + 22, 252, Math.max(14, (pw - 44) * ratio), 14, 7); ctx.fill(); }
  ctx.fillStyle = '#7d7699'; ctx.font = `13px ${FONT}`; ctx.fillText('Yujin ♥', px + 22, 296);

  return canvas.toBuffer('image/png');
}

/** Devuelve un AttachmentBuilder o null si algo falla (el embed funciona igual sin imagen). */
async function buildDailyCardAttachment(params, fetchAvatar) {
  try {
    let avatarBuffer = null;
    if (fetchAvatar && params.user?.displayAvatarURL) avatarBuffer = await fetchAvatar(params.user.displayAvatarURL({ extension: 'png', size: 128 })).catch(() => null);
    return new AttachmentBuilder(await generateDailyCard({ ...params, avatarBuffer }), { name: 'daily-card.png' });
  } catch (e) {
    logger.warn('[dailyCard] No se pudo generar la tarjeta', { error: e?.message });
    return null;
  }
}

module.exports = { generateDailyCard, buildDailyCardAttachment, weekProgress };
