const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const { normalizeExternalImageUrl } = require('../../utils/urlSafety');

const BACKGROUNDS_DIR = path.join(__dirname, '..', '..', '..', 'data', 'backgrounds');

// Asegurar que el directorio de almacenamiento local exista
function ensureBackgroundsDir() {
  try {
    if (!fs.existsSync(BACKGROUNDS_DIR)) {
      fs.mkdirSync(BACKGROUNDS_DIR, { recursive: true });
    }
  } catch (err) {
    logger.error('[imageService] Error creating backgrounds directory:', err);
  }
}

/**
 * Detecta el formato real de la imagen inspeccionando sus Magic Bytes
 * @param {Buffer} buffer
 * @returns {string|null} 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/bmp' | 'image/avif' | null
 */
function detectImageMime(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: RIFF .... WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // GIF: GIF87a o GIF89a
  if (buffer.toString('ascii', 0, 4) === 'GIF8') {
    return 'image/gif';
  }

  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }

  // AVIF: ....ftypavif o ....ftypavis
  if (buffer.length >= 16 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand.startsWith('avif') || brand.startsWith('avis')) {
      return 'image/avif';
    }
  }

  return null;
}

/**
 * Descarga y valida exhaustivamente una imagen desde una URL externa
 * @param {string} rawUrl
 * @param {number} maxSizeBytes
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, mime?: string, size?: number, error?: string }>}
 */
async function fetchAndValidateImage(rawUrl, maxSizeBytes = 10 * 1024 * 1024) {
  const safeUrl = normalizeExternalImageUrl(rawUrl);
  if (!safeUrl) {
    return { ok: false, error: 'URL no válida o bloqueada por seguridad.' };
  }

  try {
    const res = await fetch(safeUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    });

    if (!res.ok) {
      return { ok: false, error: `El servidor de la imagen respondió con error HTTP ${res.status}.` };
    }

    const contentLength = Number(res.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxSizeBytes) {
      return { ok: false, error: `La imagen excede el tamaño máximo permitido (${Math.round(maxSizeBytes / (1024 * 1024))} MB).` };
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length === 0) {
      return { ok: false, error: 'La respuesta de la imagen está vacía.' };
    }

    if (buffer.length > maxSizeBytes) {
      return { ok: false, error: `La imagen descargada excede el tamaño máximo permitido (${Math.round(maxSizeBytes / (1024 * 1024))} MB).` };
    }

    const mime = detectImageMime(buffer);
    if (!mime) {
      return { ok: false, error: 'El archivo descargado no es un formato de imagen válido (PNG, JPG, WEBP, GIF, BMP).' };
    }

    return { ok: true, buffer, mime, size: buffer.length };
  } catch (err) {
    logger.warn('[imageService] Error fetching image:', err?.message || err);
    if (err?.name === 'TimeoutError' || err?.message?.includes('timeout')) {
      return { ok: false, error: 'Tiempo de espera agotado al descargar la imagen externa (timeout 10s).' };
    }
    return { ok: false, error: 'No se pudo conectar con el servidor de la imagen.' };
  }
}

/**
 * Guarda y almacena en caché local permanente el fondo de perfil de un usuario
 * @param {string} guildId
 * @param {string} userId
 * @param {string} url
 * @returns {Promise<{ ok: boolean, mime?: string, size?: number, error?: string }>}
 */
async function saveUserProfileBackground(guildId, userId, url) {
  if (!guildId || !userId) return { ok: false, error: 'Parámetros inválidos.' };
  ensureBackgroundsDir();

  const result = await fetchAndValidateImage(url);
  if (!result.ok) {
    return result;
  }

  const filePath = path.join(BACKGROUNDS_DIR, `profile_${guildId}_${userId}.bin`);
  try {
    await fs.promises.writeFile(filePath, result.buffer);
    logger.info(`[imageService] Cached user profile background for ${userId} (${result.size} bytes)`);
    return { ok: true, mime: result.mime, size: result.size };
  } catch (err) {
    logger.error('[imageService] Error saving profile background to disk:', err);
    return { ok: false, error: 'Error guardando la imagen en el almacenamiento local del bot.' };
  }
}

/**
 * Obtiene el Buffer del fondo de perfil del usuario (desde caché local o descargando como respaldo)
 * @param {string} guildId
 * @param {string} userId
 * @param {string} fallbackUrl
 * @returns {Promise<Buffer|null>}
 */
async function getUserProfileBackgroundBuffer(guildId, userId, fallbackUrl = null) {
  if (!guildId || !userId) return null;
  ensureBackgroundsDir();

  const filePath = path.join(BACKGROUNDS_DIR, `profile_${guildId}_${userId}.bin`);

  // 1. Lectura inmediata desde disco local (0ms lag, inmune a URLs caídas/expiradas)
  try {
    if (fs.existsSync(filePath)) {
      const buf = await fs.promises.readFile(filePath);
      if (buf && buf.length > 0 && detectImageMime(buf)) {
        return buf;
      }
    }
  } catch (err) {
    logger.warn('[imageService] Failed reading local background file:', err?.message || err);
  }

  // 2. Si no está en disco y se provee una URL de respaldo, descargar y guardar en disco
  if (fallbackUrl && typeof fallbackUrl === 'string' && fallbackUrl.trim().length > 0) {
    const res = await fetchAndValidateImage(fallbackUrl);
    if (res.ok && res.buffer) {
      try {
        await fs.promises.writeFile(filePath, res.buffer);
      } catch {}
      return res.buffer;
    }
  }

  return null;
}

/**
 * Elimina el fondo de perfil guardado en disco
 * @param {string} guildId
 * @param {string} userId
 */
async function deleteUserProfileBackground(guildId, userId) {
  if (!guildId || !userId) return;
  const filePath = path.join(BACKGROUNDS_DIR, `profile_${guildId}_${userId}.bin`);
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`[imageService] Deleted cached profile background for ${userId}`);
    }
  } catch (err) {
    logger.warn('[imageService] Error deleting background file:', err?.message || err);
  }
}

/**
 * Guarda y almacena en caché local permanente el fondo de racha de un usuario
 */
async function saveUserStreakBackground(guildId, userId, url) {
  if (!guildId || !userId) return { ok: false, error: 'Parámetros inválidos.' };
  ensureBackgroundsDir();

  const result = await fetchAndValidateImage(url);
  if (!result.ok) {
    return result;
  }

  const filePath = path.join(BACKGROUNDS_DIR, `streak_${guildId}_${userId}.bin`);
  try {
    await fs.promises.writeFile(filePath, result.buffer);
    logger.info(`[imageService] Cached user streak background for ${userId} (${result.size} bytes)`);
    return { ok: true, mime: result.mime, size: result.size };
  } catch (err) {
    logger.error('[imageService] Error saving streak background to disk:', err);
    return { ok: false, error: 'Error guardando la imagen en el almacenamiento local del bot.' };
  }
}

/**
 * Obtiene el Buffer del fondo de racha del usuario
 */
async function getUserStreakBackgroundBuffer(guildId, userId, fallbackUrl = null) {
  if (!guildId || !userId) return null;
  ensureBackgroundsDir();

  const filePath = path.join(BACKGROUNDS_DIR, `streak_${guildId}_${userId}.bin`);

  try {
    if (fs.existsSync(filePath)) {
      const buf = await fs.promises.readFile(filePath);
      if (buf && buf.length > 0 && detectImageMime(buf)) {
        return buf;
      }
    }
  } catch (err) {
    logger.warn('[imageService] Failed reading local streak background file:', err?.message || err);
  }

  if (fallbackUrl && typeof fallbackUrl === 'string' && fallbackUrl.trim().length > 0) {
    const res = await fetchAndValidateImage(fallbackUrl);
    if (res.ok && res.buffer) {
      try {
        await fs.promises.writeFile(filePath, res.buffer);
      } catch {}
      return res.buffer;
    }
  }

  return null;
}

/**
 * Elimina el fondo de racha guardado en disco
 */
async function deleteUserStreakBackground(guildId, userId) {
  if (!guildId || !userId) return;
  const filePath = path.join(BACKGROUNDS_DIR, `streak_${guildId}_${userId}.bin`);
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    logger.warn('[imageService] Error deleting streak background file:', err?.message || err);
  }
}

module.exports = {
  detectImageMime,
  fetchAndValidateImage,
  saveUserProfileBackground,
  getUserProfileBackgroundBuffer,
  deleteUserProfileBackground,
  saveUserStreakBackground,
  getUserStreakBackgroundBuffer,
  deleteUserStreakBackground
};
