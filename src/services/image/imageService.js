const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const dns = require('node:dns').promises;
const http = require('node:http');
const https = require('node:https');
const { isIP } = require('node:net');
const { normalizeExternalImageUrl, parsePublicHttpUrl, isPublicIp } = require('../../utils/urlSafety');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_DOWNLOAD_MS = 10000;
const MAX_REDIRECTS = 5;

function downloadError(code, message) {
  return Object.assign(new Error(message), { code });
}

async function resolvePublicAddress(url) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }]
    : await dns.lookup(hostname, { all: true, verbatim: true });
  // Fail closed even for mixed public/private answers; never resolve again
  // while connecting. A new redirect gets its own checked DNS answer.
  if (!addresses.length || addresses.some(item =>
    !isPublicIp(item.address) || isIP(item.address) !== item.family)) {
    throw downloadError('UNSAFE_URL', 'Destino de imagen bloqueado por seguridad.');
  }
  return addresses[0];
}

function requestImage(url, address, maxSizeBytes, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const transport = url.protocol === 'https:' ? https : http;
    let response;
    let settled = false;
    function finish(error, result) {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
      response?.destroy();
      req.destroy();
    }
    const abort = () => finish(signal.reason);
    const req = transport.request(url, {
      method: 'GET',
      signal,
      agent: false, // Never reuse a socket from a different DNS validation.
      family: address.family,
      autoSelectFamily: false,
      // Retain original URL hostname for Host, TLS SNI and certificate checks.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [{ ...address }]);
        else callback(null, address.address, address.family);
      },
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Encoding': 'identity',
      },
    }, res => {
      response = res;
      res.on('error', error => finish(error));
      if (settled) { res.destroy(); return; }
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        if (!res.headers.location) {
          finish(downloadError('REDIRECT', 'Redirección de imagen sin destino.'));
        } else {
          finish(null, { location: res.headers.location });
        }
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        finish(downloadError('HTTP', `El servidor de la imagen respondió con error HTTP ${res.statusCode}.`));
        return;
      }
      // No transparent decompression: limits apply to bytes actually buffered.
      if (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') {
        finish(downloadError('ENCODING', 'El servidor envió una imagen con codificación no admitida.'));
        return;
      }
      const tooLarge = () => downloadError('SIZE', `La imagen excede el tamaño máximo permitido (${Math.round(maxSizeBytes / (1024 * 1024))} MB).`);
      if (Number(res.headers['content-length']) > maxSizeBytes) {
        finish(tooLarge());
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', chunk => {
        if (settled) return;
        size += chunk.length;
        if (size > maxSizeBytes) { finish(tooLarge()); return; }
        chunks.push(chunk);
      });
      res.on('end', () => finish(null, { buffer: Buffer.concat(chunks, size) }));
      res.on('aborted', () => finish(downloadError('NETWORK', 'Descarga de imagen interrumpida.')));
      res.on('close', () => {
        if (!settled) finish(downloadError('NETWORK', 'Descarga de imagen interrumpida.'));
      });
    });
    req.on('error', error => finish(error));
    signal.addEventListener('abort', abort, { once: true });
    req.end();
  });
}

// One deadline covers DNS, connection, redirects and streaming (not just idle
// socket time). OS DNS lookup cannot be cancelled, but a late answer can never
// start a request after this deadline. No proxy environment variables are used.
async function downloadImage(rawUrl, maxSizeBytes = MAX_IMAGE_BYTES, timeoutMs = MAX_DOWNLOAD_MS) {
  if (!Number.isSafeInteger(maxSizeBytes) || maxSizeBytes <= 0 || maxSizeBytes > MAX_IMAGE_BYTES ||
      !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_DOWNLOAD_MS) {
    throw downloadError('LIMIT', 'Límites de descarga de imagen inválidos.');
  }
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = downloadError('TIMEOUT', 'Tiempo de espera agotado al descargar la imagen externa.');
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      let target = rawUrl;
      for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        const url = parsePublicHttpUrl(target);
        if (!url) throw downloadError('UNSAFE_URL', 'URL no válida o bloqueada por seguridad.');
        const address = await resolvePublicAddress(url);
        controller.signal.throwIfAborted();
        const result = await requestImage(url, address, maxSizeBytes, controller.signal);
        if (result.buffer) return result.buffer;
        if (redirects === MAX_REDIRECTS) break;
        // Keep signed query parameters and allow extensionless CDN redirects.
        target = new URL(result.location, url).toString();
      }
      throw downloadError('REDIRECT', 'Demasiadas redirecciones al descargar la imagen.');
    })()]);
  } finally {
    clearTimeout(timer);
  }
}

// Renderers historically accept extensionless URLs and SVG. Preserve that
// contract while sharing ALL network protections with background uploads.
async function fetchImageBuffer(url, { timeoutMs = MAX_DOWNLOAD_MS } = {}) {
  try { return await downloadImage(url, MAX_IMAGE_BYTES, timeoutMs); }
  catch { return null; }
}

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
async function fetchAndValidateImage(rawUrl, maxSizeBytes = MAX_IMAGE_BYTES) {
  const safeUrl = normalizeExternalImageUrl(rawUrl);
  if (!safeUrl) {
    return { ok: false, error: 'URL no válida o bloqueada por seguridad.' };
  }

  try {
    const buffer = await downloadImage(safeUrl, maxSizeBytes);

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
    // Do not log remote URLs, DNS answers or signed CDN tokens.
    if (['UNSAFE_URL', 'SIZE', 'HTTP', 'TIMEOUT', 'REDIRECT', 'ENCODING', 'LIMIT'].includes(err?.code)) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: 'No se pudo conectar con el servidor de la imagen.' };
  }
}

function getSafeImagePath(prefix, guildId, userId) {
  const safeGuild = String(guildId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const safeUser = String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeGuild || !safeUser) return null;
  const filePath = path.join(BACKGROUNDS_DIR, `${prefix}_${safeGuild}_${safeUser}.bin`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(BACKGROUNDS_DIR))) return null;
  return resolved;
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

  const filePath = getSafeImagePath('profile', guildId, userId);
  if (!filePath) return { ok: false, error: 'Identificador de usuario o servidor no válido.' };

  const result = await fetchAndValidateImage(url);
  if (!result.ok) {
    return result;
  }

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

  const filePath = getSafeImagePath('profile', guildId, userId);
  if (!filePath) return null;

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
  const filePath = getSafeImagePath('profile', guildId, userId);
  if (!filePath) return;
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

  const filePath = getSafeImagePath('streak', guildId, userId);
  if (!filePath) return { ok: false, error: 'Identificador de usuario o servidor no válido.' };

  const result = await fetchAndValidateImage(url);
  if (!result.ok) {
    return result;
  }

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

  const filePath = getSafeImagePath('streak', guildId, userId);
  if (!filePath) return null;

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
  const filePath = getSafeImagePath('streak', guildId, userId);
  if (!filePath) return;
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
  fetchImageBuffer,
  saveUserProfileBackground,
  getUserProfileBackgroundBuffer,
  deleteUserProfileBackground,
  saveUserStreakBackground,
  getUserStreakBackgroundBuffer,
  deleteUserStreakBackground
};
