const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createCanvas } = require('@napi-rs/canvas');
const { initFonts, FONT_FALLBACKS } = require('../canvasFontLoader');

describe('CanvasFontLoader', () => {
  it('debe exportar FONT_FALLBACKS con fuentes multiplataforma', () => {
    assert(typeof FONT_FALLBACKS === 'string');
    assert(FONT_FALLBACKS.includes('Segoe UI'));
    assert(FONT_FALLBACKS.includes('DejaVu Sans'));
    assert(FONT_FALLBACKS.includes('sans-serif'));
    assert(FONT_FALLBACKS.includes('Noto Sans JP'));
  });

  it('initFonts() debe ejecutarse sin errores', () => {
    const result = initFonts();
    assert.strictEqual(typeof result, 'string');
    assert(result.includes('sans-serif'));
  });

  it('debe renderizar caracteres japoneses, coreanos, árabes y emojis sin error', () => {
    initFonts();
    const canvas = createCanvas(400, 100);
    const ctx = canvas.getContext('2d');
    ctx.font = `bold 24px ${FONT_FALLBACKS}`;
    ctx.fillStyle = '#ffffff';

    const testString = '🇯🇵 こんにちは・夜神月 🇰🇷 유진 🇸🇦 مرحبا ⚡ 🔥 👑';
    ctx.fillText(testString, 10, 50);

    const buf = canvas.toBuffer('image/png');
    assert(buf && buf.length > 0);
  });
});
