const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createCanvas } = require('@napi-rs/canvas');
const { initFonts, FONT_FALLBACKS } = require('../canvasFontLoader');
const { generateStreakCard } = require('../../services/streak/streakCard');
const { getFlameTier, getNextTier } = require('../../services/streak/streakService');

describe('CanvasFontLoader - Soporte Internacional Completo', () => {
  it('debe exportar FONT_FALLBACKS con fuentes multiplataforma y todos los alfabetos', () => {
    assert(typeof FONT_FALLBACKS === 'string');
    assert(FONT_FALLBACKS.includes('Segoe UI'));
    assert(FONT_FALLBACKS.includes('DejaVu Sans'));
    assert(FONT_FALLBACKS.includes('sans-serif'));
    assert(FONT_FALLBACKS.includes('Noto Sans JP'));
    assert(FONT_FALLBACKS.includes('Noto Sans KR'));
    assert(FONT_FALLBACKS.includes('Noto Sans SC'));
    assert(FONT_FALLBACKS.includes('Noto Sans Arabic'));
    assert(FONT_FALLBACKS.includes('Noto Sans Devanagari'));
    assert(FONT_FALLBACKS.includes('Noto Sans Thai'));
    assert(FONT_FALLBACKS.includes('Noto Sans Hebrew'));
  });

  it('initFonts() debe ejecutarse sin errores e inicializar familias de fuentes', () => {
    const result = initFonts();
    assert.strictEqual(typeof result, 'string');
    assert(result.includes('sans-serif'));
  });

  it('debe renderizar caracteres de todos los idiomas sin error', () => {
    initFonts();
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    ctx.font = `bold 22px ${FONT_FALLBACKS}`;
    ctx.fillStyle = '#ffffff';

    const testStrings = [
      '🇯🇵 Japonés: こんにちは・夜神月 (Hiragana, Katakana, Kanji)',
      '🇰🇷 Coreano: 유진 활동 랭킹 스트릭 (Hangul)',
      '🇨🇳 Chino Simplificado: 欢迎使用活动排行榜 (SC)',
      '🇹🇼 Chino Tradicional: 歡迎使用繁體排行榜 (TC)',
      '🇸🇦 Árabe: مرحباً بك في لوحة المتصدرين (Arabic / RTL)',
      '🇷🇺 Cirílico: Привет мир • Таблица лидеров (Cyrillic)',
      '🇬🇷 Griego: Γεια σου κόσμε • Επίπεδο δραστηριότητας',
      '🇮🇳 Devanagari / Hindi: नमस्ते दुनिया • गतिविधि स्तर',
      '🇹🇭 Tailandés: สวัสดีชาวโลก • ตารางอันดับ',
      '🇮🇱 Hebreo: שלום עולם • טבלת מובילים',
      '🇻🇳 Vietnamita: Xin chào thế giới • Bảng xếp hạng',
      '✨ Símbolos y Emojis: 👑 🔥 💎 ⚡ 🌟 🎮 🏆'
    ];

    let y = 30;
    for (const str of testStrings) {
      ctx.fillText(str, 15, y);
      y += 30;
    }

    const buf = canvas.toBuffer('image/png');
    assert(buf && buf.length > 1000);
  });

  it('generateStreakCard debe renderizar usuarios con nombres en cualquier idioma sin error', async () => {
    initFonts();

    const multiLangUsers = [
      { displayName: '夜神月_LIGHT', username: 'light_jp', displayAvatarURL: () => 'https://example.com/avatar1.png' },
      { displayName: '유진_YUJIN', username: 'yujin_kr', displayAvatarURL: () => 'https://example.com/avatar2.png' },
      { displayName: 'مستخدم_عربي', username: 'arabic_user', displayAvatarURL: () => 'https://example.com/avatar3.png' },
      { displayName: 'Владимир_RU', username: 'russian_user', displayAvatarURL: () => 'https://example.com/avatar4.png' }
    ];

    for (const mockUser of multiLangUsers) {
      const status = {
        streakDays: 14,
        isActiveToday: true,
        currentTier: getFlameTier(14),
        nextTier: getNextTier(14),
        progressPercent: 60,
        daysToNext: 16,
        freezersCount: 2,
        streakBgUrl: '',
        streakBgOpacity: 0.65,
        streakAccent: '#E67E22'
      };

      const attachment = await generateStreakCard(mockUser, status, 'Yujin Bot');
      assert.ok(attachment);
      assert.ok(Buffer.isBuffer(attachment.attachment));
      assert.ok(attachment.attachment.length > 1000);
    }
  });
});
