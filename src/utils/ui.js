// Presentación compartida. Mantiene los datos y las preferencias del usuario.
const { EmbedBuilder } = require('discord.js');
const path = require('node:path');

const BRAND = Object.freeze({ name: 'Yujin ♥', avatarPath: path.resolve(__dirname, '../../sources/avatar.jpg') });

const COLORS = Object.freeze({
  primary: 0xA78BFA, blurple: 0xA78BFA, info: 0xA78BFA,
  success: 0x6EE7B7, error: 0xFB7185, warning: 0xFBBF24,
  boost: 0xE9A8F5, level: 0xA78BFA, economy: 0xE9C46A,
  neutral: 0x94A3B8,
});

function createEmbed(color = COLORS.primary) {
  return new EmbedBuilder().setColor(color).setFooter({ text: 'Yujin ♥ · Un espacio para compartir y brillar' });
}

const numberFormat = new Intl.NumberFormat('es-MX');
function formatNumber(value) {
  const number = Number(value);
  return numberFormat.format(Number.isFinite(number) ? number : 0);
}

function progressBar(value, target, size = 10) {
  const ratio = target > 0 ? Math.max(0, Math.min(1, (Number(value) || 0) / target)) : 0;
  const filled = Math.round(ratio * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled) + ' ' + Math.floor(ratio * 100) + '%';
}

function formatVoiceTime(ms) {
  const minutes = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
  return Math.floor(minutes / 60) + ' h ' + String(minutes % 60).padStart(2, '0') + ' min';
}

function clip(value, max) {
  const text = String(value ?? '');
  return text.length <= max ? text : text.slice(0, Math.max(0, max - 1)) + '…';
}

module.exports = { BRAND, COLORS, createEmbed, formatNumber, progressBar, formatVoiceTime, clip };
