const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeExternalImageUrl } = require('../urlSafety');

test('normalizeExternalImageUrl accepts safe public image hosts', () => {
  const url = 'https://catbox.moe/user/file.png?raw=1';
  const normalized = normalizeExternalImageUrl(url);

  assert.equal(normalized, 'https://catbox.moe/user/file.png');
});

test('normalizeExternalImageUrl preserves essential query params for Unsplash and Discord CDN', () => {
  const unsplashUrl = 'https://images.unsplash.com/photo-1517594422361-5eeb8ae275a9?q=80&w=1000#section';
  assert.equal(
    normalizeExternalImageUrl(unsplashUrl),
    'https://images.unsplash.com/photo-1517594422361-5eeb8ae275a9?q=80&w=1000'
  );

  const discordUrl = 'https://cdn.discordapp.com/attachments/123/456/sample.png?ex=6600&is=6500&hm=deadbeef#fragment';
  assert.equal(
    normalizeExternalImageUrl(discordUrl),
    'https://cdn.discordapp.com/attachments/123/456/sample.png?ex=6600&is=6500&hm=deadbeef'
  );
});

test('normalizeExternalImageUrl validates all streak and profile template URLs', () => {
  const { STREAK_TEMPLATES } = require('../../constants/streakThemes');
  const { WALLPAPER_PRESETS } = require('../../constants/profileThemes');

  for (const [key, tpl] of Object.entries(STREAK_TEMPLATES)) {
    const validated = normalizeExternalImageUrl(tpl.url);
    assert.ok(validated, `Streak template "${key}" URL should be valid: ${tpl.url}`);
    assert.equal(validated, tpl.url);
  }

  for (const [key, tpl] of Object.entries(WALLPAPER_PRESETS)) {
    const validated = normalizeExternalImageUrl(tpl.url);
    assert.ok(validated, `Profile preset "${key}" URL should be valid: ${tpl.url}`);
    assert.equal(validated, tpl.url);
  }
});

test('normalizeExternalImageUrl rejects private and dangerous URLs', () => {
  const rejects = [
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'http://localhost/test.png',
    'https://127.0.0.1/test.png',
    'https://user:pass@danger.com/test.png'
  ];

  for (const value of rejects) {
    assert.equal(normalizeExternalImageUrl(value), null);
  }
});

