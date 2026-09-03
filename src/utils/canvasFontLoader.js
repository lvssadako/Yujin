const fs = require('fs');
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');
const logger = require('./logger');

const FONT_FALLBACKS = [
  '"Roboto"',
  '"Noto Sans"',
  '"Noto Sans JP"',
  '"Noto Sans CJK JP"',
  '"Noto Sans KR"',
  '"Noto Sans CJK KR"',
  '"Noto Sans SC"',
  '"Noto Sans CJK SC"',
  '"Noto Sans TC"',
  '"Noto Sans CJK TC"',
  '"Noto Sans Arabic"',
  '"Noto Sans Devanagari"',
  '"Noto Sans Thai"',
  '"Noto Sans Hebrew"',
  '"Noto Sans Bengali"',
  '"Noto Sans Tamil"',
  '"Noto Sans Telugu"',
  '"Noto Sans Malayalam"',
  '"Noto Sans Kannada"',
  '"Noto Sans Gujarati"',
  '"Noto Sans Gurmukhi"',
  '"Noto Sans Sinhala"',
  '"Noto Sans Myanmar"',
  '"Noto Sans Khmer"',
  '"Noto Sans Lao"',
  '"Noto Sans Georgian"',
  '"Noto Sans Armenian"',
  '"Noto Color Emoji"',
  '"Noto Emoji"',
  '"Segoe UI Emoji"',
  '"Segoe UI Symbol"',
  '"Apple Color Emoji"',
  '"Meiryo"',
  '"Malgun Gothic"',
  '"Microsoft YaHei"',
  '"Microsoft JhengHei"',
  '"Nirmala UI"',
  '"Leelawadee UI"',
  '"DejaVu Sans"',
  '"Liberation Sans"',
  '"Segoe UI"',
  '"Arial"',
  'sans-serif'
].join(', ');

let initialized = false;

function walkDirForFonts(dir, maxDepth = 4, currentDepth = 0) {
  if (!fs.existsSync(dir) || currentDepth > maxDepth) return [];
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(walkDirForFonts(fullPath, maxDepth, currentDepth + 1));
        } else if (/\.(ttf|otf|ttc)$/i.test(file)) {
          results.push(fullPath);
        }
      } catch {}
    }
  } catch {}
  return results;
}

function initFonts() {
  if (initialized) return FONT_FALLBACKS;
  initialized = true;

  try {
    // 1. Registrar fuentes empaquetadas en assets/fonts/ con alias explícitos
    const localFontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
    if (fs.existsSync(localFontsDir)) {
      const localFiles = fs.readdirSync(localFontsDir);
      for (const file of localFiles) {
        if (/\.(ttf|otf|ttc)$/i.test(file)) {
          const fontPath = path.join(localFontsDir, file);
          try {
            GlobalFonts.registerFromPath(fontPath);

            if (file.includes('Roboto')) {
              GlobalFonts.registerFromPath(fontPath, 'Roboto');
              GlobalFonts.registerFromPath(fontPath, 'Segoe UI');
              GlobalFonts.registerFromPath(fontPath, 'DejaVu Sans');
              GlobalFonts.registerFromPath(fontPath, 'Arial');
              GlobalFonts.registerFromPath(fontPath, 'sans-serif');
            } else if (file.includes('NotoSansJP') || file.includes('JP')) {
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans JP');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans CJK JP');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans CJK');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans SC');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans TC');
            } else if (file.includes('NotoSansKR') || file.includes('KR')) {
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans KR');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans CJK KR');
            } else if (file.includes('Arabic')) {
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans Arabic');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans Persian');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans Urdu');
            } else if (file.includes('Emoji')) {
              GlobalFonts.registerFromPath(fontPath, 'Noto Emoji');
              GlobalFonts.registerFromPath(fontPath, 'Noto Color Emoji');
              GlobalFonts.registerFromPath(fontPath, 'Segoe UI Emoji');
              GlobalFonts.registerFromPath(fontPath, 'Apple Color Emoji');
            }
          } catch (e) {
            logger.debug(`[FontLoader] Error al registrar fuente local ${file}: ${e.message}`);
          }
        }
      }
    }

    // 2. Escaneo de fuentes del sistema operativo (Windows, Linux, macOS)
    const systemFontDirs = [
      // Linux / Unix
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      path.join(process.env.HOME || '', '.fonts'),
      path.join(process.env.HOME || '', '.local/share/fonts'),
      // Windows
      process.env.WINDIR ? path.join(process.env.WINDIR, 'Fonts') : 'C:\\Windows\\Fonts',
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts'),
      // macOS
      '/Library/Fonts',
      '/System/Library/Fonts',
      path.join(process.env.HOME || '', 'Library', 'Fonts')
    ].filter(d => Boolean(d) && fs.existsSync(d));

    for (const fontDir of systemFontDirs) {
      const foundFonts = walkDirForFonts(fontDir, 2);
      for (const fontPath of foundFonts) {
        try {
          GlobalFonts.registerFromPath(fontPath);
        } catch {}
      }
    }

    const families = GlobalFonts.families || [];
    logger.info(`[FontLoader] Soporte multi-idioma de fuentes activo en Canvas: ${families.length} familias registradas.`);
  } catch (err) {
    logger.warn('[FontLoader] Advertencia al inicializar fuentes de Canvas:', err.message);
  }

  return FONT_FALLBACKS;
}

module.exports = {
  initFonts,
  FONT_FALLBACKS
};
