const fs = require('node:fs');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const { AttachmentBuilder } = require('discord.js');

// Fotografías originales del proyecto. Una selección por panel conserva
// el mismo banner al navegar, sin almacenar estado entre usuarios.
function createHelpArtwork({
  sourcesDir = path.resolve(__dirname, '../../sources'),
  fallbackPath = path.resolve(__dirname, '../assets/banners/help_banner.jpg'),
  select = randomInt,
} = {}) {
  const files = [];
  let avatarURL = null;
  let bannerURL = null;
  const avatar = path.join(sourcesDir, 'avatar.jpg');
  if (fs.existsSync(avatar)) {
    files.push(new AttachmentBuilder(avatar, { name: 'yujin-avatar.jpg' }));
    avatarURL = 'attachment://yujin-avatar.jpg';
  }
  const banners = fs.existsSync(sourcesDir) ? fs.readdirSync(sourcesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && !/^avatar\./i.test(entry.name) && /\.(jpe?g|png|webp|gif)$/i.test(entry.name))
    .map(entry => path.join(sourcesDir, entry.name)).sort() : [];
  const banner = banners.length ? banners[select(banners.length)] : fs.existsSync(fallbackPath) ? fallbackPath : null;
  if (banner) {
    const filename = 'yujin-banner' + path.extname(banner).toLowerCase();
    files.push(new AttachmentBuilder(banner, { name: filename }));
    bannerURL = 'attachment://' + filename;
  }
  function apply(embed) {
    if (avatarURL) {
      embed.setThumbnail(avatarURL);
      embed.setAuthor({ ...(embed.data.author || { name: 'Yujin ♥' }), iconURL: avatarURL });
    }
    if (bannerURL) embed.setImage(bannerURL);
    return embed;
  }
  return { files, apply };
}
module.exports = { createHelpArtwork };
