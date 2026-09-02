const fs = require('fs');
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');
const logger = require('./logger');

const FONT_FALLBACKS = '"Roboto", "Noto Sans JP", "Noto Sans CJK JP", "Noto Sans KR", "Noto Sans Arabic", "Noto Emoji", "Segoe UI Emoji", "Apple Color Emoji", "DejaVu Sans", "Liberation Sans", "Segoe UI", Arial, sans-serif';

let initialized = false;

function walkDirForFonts(dir) {
  if (!fs.existsSync(dir)) return [];
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(walkDirForFonts(fullPath));
      } else if (file.endsWith('.ttf') || file.endsWith('.otf') || file.endsWith('.ttc')) {
        results.push(fullPath);
      }
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
        if (file.endsWith('.ttf') || file.endsWith('.otf') || file.endsWith('.ttc')) {
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
            } else if (file.includes('NotoSansKR') || file.includes('KR')) {
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans KR');
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans CJK KR');
            } else if (file.includes('Arabic')) {
              GlobalFonts.registerFromPath(fontPath, 'Noto Sans Arabic');
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

    // 2. Escaneo recursivo de fuentes del sistema Linux / Unix
    const linuxFontDirs = [
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      path.join(process.env.HOME || '', '.fonts'),
      path.join(process.env.HOME || '', '.local/share/fonts')
    ];

    for (const fontDir of linuxFontDirs) {
      const foundFonts = walkDirForFonts(fontDir);
      for (const fontPath of foundFonts) {
        try {
          GlobalFonts.registerFromPath(fontPath);
        } catch {}
      }
    }

    const families = GlobalFonts.families || [];
    logger.info(`[FontLoader] Fuentes registradas en Canvas: ${families.length} familias disponibles.`);
  } catch (err) {
    logger.warn('[FontLoader] Advertencia al inicializar fuentes de Canvas:', err.message);
  }

  return FONT_FALLBACKS;
}

module.exports = {
  initFonts,
  FONT_FALLBACKS
};
