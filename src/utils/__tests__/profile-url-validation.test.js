const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeExternalImageUrl } = require('../urlSafety');
const { isPublicIp, isPrivateHostname } = require('../urlSafety');

const dangerousAddresses = [
  '0.0.0.0', '0.1.2.3', '10.255.255.255', '100.64.0.1', '100.127.255.254',
  '127.42.0.2', '169.254.169.254', '172.16.0.1', '172.31.255.255',
  '192.0.0.9', '192.0.2.1', '192.31.196.1', '192.52.193.1', '192.88.99.1',
  '192.168.255.255', '192.175.48.1', '198.18.0.1', '198.19.255.255',
  '198.51.100.10', '203.0.113.10', '224.0.0.1', '239.255.255.255',
  '240.0.0.1', '255.255.255.255', '168.63.129.16',
  '::', '::1', '::127.0.0.1', '::ffff:127.0.0.1', '::ffff:8.8.8.8',
  '64:ff9b::a9fe:a9fe', '64:ff9b:1::1', '100::1', '100:0:0:1::1',
  '2001::1', '2001:2::1', '2001:db8::1', '2002:7f00:1::',
  '2620:4f:8000::1', '3fff::1', '5f00::1', 'fc00::1', 'fdff::1',
  'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '2606:4700::5efe:7f00:1',
];

test('rejects complete special IPv4/IPv6 ranges and metadata destinations', () => {
  for (const address of dangerousAddresses) {
    assert.equal(isPublicIp(address), false, address);
    const host = address.includes(':') ? `[${address}]` : address;
    assert.equal(normalizeExternalImageUrl(`http://${host}/image.png`), null, host);
  }
});

test('WHATWG normalization cannot bypass IP validation', () => {
  for (const host of ['2130706433', '0177.0.0.1', '0x7f000001', '127.1',
    '127.0.0.1.', '%31%32%37.0.0.1', '[0:0:0:0:0:ffff:7f00:1]',
    'localhost.', 'foo.localhost.', 'service.local', 'metadata.google.internal',
    'metadata.goog', 'router.home.arpa', '[fe80::1%25eth0]']) {
    assert.equal(normalizeExternalImageUrl(`http://${host}/image.png`), null, host);
  }
});

test('allows public IPs, range boundaries and domains starting with fc/fd', () => {
  for (const address of ['8.8.8.8', '100.63.255.255', '100.128.0.0', '172.15.255.255',
    '172.32.0.0', '198.17.255.255', '198.20.0.0', '223.255.255.254', '2606:4700:4700::1111']) {
    assert.equal(isPublicIp(address), true, address);
    assert.equal(isPrivateHostname(address), false, address);
  }
  assert.ok(normalizeExternalImageUrl('https://fcdn.example.com/image.png'));
  assert.ok(normalizeExternalImageUrl('https://fd-images.example.com/image.png'));
  for (const invalid of ['', 'garbage', '127.1', '256.1.2.3', 'fe80::1%eth0', null]) {
    assert.equal(isPublicIp(invalid), false);
  }
});

test('CDN lookalikes receive no trusted-host exceptions', () => {
  for (const host of ['cdn.discordapp.com.attacker.com', 'fakeimages.unsplash.com',
    'images.unsplash.com.attacker.com', 'evilimgur.com', 'catbox.moe.attacker.com']) {
    assert.equal(normalizeExternalImageUrl(`https://${host}/attachments/123/file`), null, host);
    assert.equal(normalizeExternalImageUrl(`https://${host}/image.png?secret=1`), `https://${host}/image.png`);
  }
  assert.ok(normalizeExternalImageUrl('https://files.catbox.moe/file'));
});

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

