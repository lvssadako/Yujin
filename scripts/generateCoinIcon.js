// Genera assets/icons/coin.png (128x128): la moneda del servidor, un corazón sobre una moneda dorada.
// Uso: node scripts/generateCoinIcon.js
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');

const SIZE = 128;
const canvas = createCanvas(SIZE, SIZE);
const ctx = canvas.getContext('2d');
const c = SIZE / 2;

// Sombra suave
ctx.fillStyle = 'rgba(0,0,0,0.18)';
ctx.beginPath(); ctx.ellipse(c, c + 8, 56, 52, 0, 0, Math.PI * 2); ctx.fill();

// Borde exterior (violeta de la marca) y disco dorado
const rim = ctx.createLinearGradient(0, 0, SIZE, SIZE);
rim.addColorStop(0, '#C4B5FD'); rim.addColorStop(1, '#7C5CE0');
ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(c, c, 60, 0, Math.PI * 2); ctx.fill();

const gold = ctx.createRadialGradient(c - 18, c - 22, 6, c, c, 54);
gold.addColorStop(0, '#FFF3B0'); gold.addColorStop(0.55, '#F4C95D'); gold.addColorStop(1, '#D9A23A');
ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(c, c, 52, 0, Math.PI * 2); ctx.fill();

// Anillo interior
ctx.strokeStyle = 'rgba(160,100,20,0.55)'; ctx.lineWidth = 3;
ctx.beginPath(); ctx.arc(c, c, 43, 0, Math.PI * 2); ctx.stroke();

// Corazón
function heart(cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.6, cy - s * 0.1, cx - s * 0.9, cy - s * 1.3, cx, cy - s * 0.4);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.3, cx + s * 1.6, cy - s * 0.1, cx, cy + s * 0.9);
  ctx.closePath();
}
ctx.save();
ctx.shadowColor = 'rgba(120,60,0,0.35)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
const hg = ctx.createLinearGradient(0, c - 25, 0, c + 25);
hg.addColorStop(0, '#FF8FB1'); hg.addColorStop(1, '#E0457B');
ctx.fillStyle = hg; heart(c, c + 2, 23); ctx.fill();
ctx.restore();

// Brillo
ctx.fillStyle = 'rgba(255,255,255,0.55)';
ctx.beginPath(); ctx.ellipse(c - 20, c - 22, 12, 5, -0.7, 0, Math.PI * 2); ctx.fill();

const out = path.join(__dirname, '..', 'assets', 'icons', 'coin.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log('Icono generado:', out, fs.statSync(out).size, 'bytes');
