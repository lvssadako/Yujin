const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  detectImageMime,
  saveUserProfileBackground,
  getUserProfileBackgroundBuffer,
  deleteUserProfileBackground
} = require('../imageService');

test('detectImageMime correctly identifies valid image formats', () => {
  // PNG
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  assert.equal(detectImageMime(pngHeader), 'image/png');

  // JPEG
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(detectImageMime(jpegHeader), 'image/jpeg');

  // WebP
  const webpHeader = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii')
  ]);
  assert.equal(detectImageMime(webpHeader), 'image/webp');

  // GIF
  const gifHeader = Buffer.from('GIF89a123456', 'ascii');
  assert.equal(detectImageMime(gifHeader), 'image/gif');

  // Non-image text
  const textHeader = Buffer.from('<!DOCTYPE html><html>', 'utf8');
  assert.equal(detectImageMime(textHeader), null);
});

test('getUserProfileBackgroundBuffer reads local file if present and falls back gracefully', async () => {
  const guildId = 'test_guild_999';
  const userId = 'test_user_999';
  const backgroundsDir = path.join(__dirname, '..', '..', '..', '..', 'data', 'backgrounds');
  const filePath = path.join(backgroundsDir, `profile_${guildId}_${userId}.bin`);

  if (!fs.existsSync(backgroundsDir)) {
    fs.mkdirSync(backgroundsDir, { recursive: true });
  }

  // Write fake PNG
  const fakePng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x00, 0x00, 0x00, 0x00]);
  fs.writeFileSync(filePath, fakePng);

  const buffer = await getUserProfileBackgroundBuffer(guildId, userId);
  assert.ok(buffer);
  assert.equal(buffer.length, fakePng.length);

  // Clean up
  await deleteUserProfileBackground(guildId, userId);
  assert.equal(fs.existsSync(filePath), false);

  const emptyBuffer = await getUserProfileBackgroundBuffer(guildId, userId);
  assert.equal(emptyBuffer, null);
});
