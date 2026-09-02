const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONTS_TO_DOWNLOAD = [
  {
    filename: 'NotoSansJP-Variable.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf',
    aliases: ['Noto Sans JP', 'Noto Sans CJK JP', 'Noto Sans CJK', 'Japanese']
  },
  {
    filename: 'NotoSansKR-Variable.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf',
    aliases: ['Noto Sans KR', 'Noto Sans CJK KR', 'Korean']
  },
  {
    filename: 'NotoSansArabic-Variable.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwght%5D.ttf',
    aliases: ['Noto Sans Arabic', 'Arabic']
  },
  {
    filename: 'NotoEmoji-Variable.ttf',
    url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf',
    aliases: ['Noto Emoji', 'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji']
  }
];

async function main() {
  const fontsDir = path.join(__dirname, '..', 'assets', 'fonts');
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  for (const font of FONTS_TO_DOWNLOAD) {
    const dest = path.join(fontsDir, font.filename);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      console.log(`Downloading ${font.filename} from ${font.url}...`);
      const res = await fetch(font.url);
      if (!res.ok) {
        console.error(`Failed to download ${font.filename}: ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(dest, buf);
      console.log(`Saved ${font.filename} (${buf.length} bytes)`);
    } else {
      console.log(`Font ${font.filename} already exists (${fs.statSync(dest).size} bytes).`);
    }

    try {
      GlobalFonts.registerFromPath(dest);
      for (const alias of font.aliases) {
        GlobalFonts.registerFromPath(dest, alias);
      }
    } catch (err) {
      console.error(`Error registering ${font.filename}:`, err);
    }
  }

  // Test rendering multilingual text
  const canvas = createCanvas(800, 200);
  const ctx = canvas.getContext('2d');
  const fontChain = '"Roboto", "Noto Sans JP", "Noto Sans KR", "Noto Sans Arabic", "Noto Emoji", "Segoe UI Emoji", "DejaVu Sans", sans-serif';
  ctx.font = `bold 28px ${fontChain}`;
  ctx.fillStyle = '#ffffff';

  const testTexts = [
    '🇯🇵 Japonés: こんにちは・夜神月・テスト',
    '🇰🇷 Coreano: 안녕하세요・유진・테스트',
    '🇸🇦 Árabe: مرحبا بك',
    '🇷🇺 Ruso / Cirílico: Привет мир • Юджин',
    '✨ Emojis & Símbolos: ⚡ 🔥 👑 🌸 ⚔️ 🛡️ 🎨 📊'
  ];

  ctx.fillStyle = '#10121a';
  ctx.fillRect(0, 0, 800, 200);
  ctx.fillStyle = '#ffffff';

  testTexts.forEach((text, i) => {
    ctx.fillText(text, 20, 35 + i * 35);
  });

  const buffer = canvas.toBuffer('image/png');
  console.log('✅ Successfully rendered canvas with multilingual characters! Buffer size:', buffer.length);
}

main().catch(console.error);
