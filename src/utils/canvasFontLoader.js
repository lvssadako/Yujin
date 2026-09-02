const fs = require('fs');
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');
const logger = require('./logger');

const FONT_FALLBACKS = '"Segoe UI", "DejaVu Sans", "Liberation Sans", "Noto Sans", Arial, sans-serif';

let initialized = false;

function initFonts() {
  if (initialized) return FONT_FALLBACKS;
  initialized = true;

  try {
    // Si estamos en Linux / Unix, intentar cargar fuentes de directorios comunes del sistema
    const linuxFontDirs = [
      '/usr/share/fonts',
      '/usr/local/share/fonts',
      '/usr/share/fonts/truetype',
      '/usr/share/fonts/opentype',
      path.join(process.env.HOME || '', '.fonts'),
      path.join(process.env.HOME || '', '.local/share/fonts')
    ];

    let loadedAny = false;
    for (const fontDir of linuxFontDirs) {
      if (fs.existsSync(fontDir)) {
        try {
          GlobalFonts.loadFontsFromDir(fontDir);
          loadedAny = true;
        } catch (e) {
          logger.debug(`[FontLoader] No se pudo cargar desde ${fontDir}: ${e.message}`);
        }
      }
    }

    // Directorio local de fuentes en assets/fonts si existiera
    const localFontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
    if (fs.existsSync(localFontsDir)) {
      try {
        GlobalFonts.loadFontsFromDir(localFontsDir);
        loadedAny = true;
      } catch (e) {
        logger.debug(`[FontLoader] Error cargando fuentes locales: ${e.message}`);
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
