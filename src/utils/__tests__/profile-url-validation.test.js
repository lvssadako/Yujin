const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeExternalImageUrl } = require('../urlSafety');

test('normalizeExternalImageUrl accepts safe public image hosts', () => {
  const url = 'https://catbox.moe/user/file.png?raw=1';
  const normalized = normalizeExternalImageUrl(url);

  assert.equal(normalized, 'https://catbox.moe/user/file.png');
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
