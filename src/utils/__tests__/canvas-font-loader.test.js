const { describe, it } = require('node:test');
const assert = require('node:assert');
const { initFonts, FONT_FALLBACKS } = require('../canvasFontLoader');

describe('CanvasFontLoader', () => {
  it('debe exportar FONT_FALLBACKS con fuentes multiplataforma', () => {
    assert(typeof FONT_FALLBACKS === 'string');
    assert(FONT_FALLBACKS.includes('Segoe UI'));
    assert(FONT_FALLBACKS.includes('DejaVu Sans'));
    assert(FONT_FALLBACKS.includes('sans-serif'));
  });

  it('initFonts() debe ejecutarse sin errores', () => {
    const result = initFonts();
    assert.strictEqual(typeof result, 'string');
    assert(result.includes('sans-serif'));
  });
});
