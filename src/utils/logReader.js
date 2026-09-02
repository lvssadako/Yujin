const fs = require('node:fs');
const path = require('node:path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
const ERROR_LOG_PATH = path.join(LOGS_DIR, 'error.log');
const COMBINED_LOG_PATH = path.join(LOGS_DIR, 'combined.log');

/**
 * Parsea un archivo de logs línea por línea en formato JSON.
 * @param {string} filePath
 * @returns {Array<object>}
 */
function readLogEntries(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
    const entries = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === 'object') {
          entries.push(parsed);
        }
      } catch {
        // Formato no-JSON (texto plano)
        entries.push({
          level: 'info',
          message: line,
          timestamp: 'N/A'
        });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Obtiene los registros de errores y advertencias más recientes.
 * @param {object} [options]
 * @param {number} [options.limit=15] Cantidad de logs a retornar (por defecto 15)
 * @param {'all'|'error'|'warn'} [options.filter='all'] Filtro de nivel
 * @returns {Array<object>}
 */
function getRecentProblemLogs({ limit = 15, filter = 'all' } = {}) {
  const errorLogs = readLogEntries(ERROR_LOG_PATH);
  const combinedLogs = readLogEntries(COMBINED_LOG_PATH);

  // Unificar y deduplicar logs por timestamp + message
  const map = new Map();
  for (const entry of [...combinedLogs, ...errorLogs]) {
    const level = (entry.level || '').toLowerCase();
    if (filter === 'error' && level !== 'error') continue;
    if (filter === 'warn' && level !== 'warn' && level !== 'warning') continue;
    if (filter === 'all' && level !== 'error' && level !== 'warn' && level !== 'warning') continue;

    const key = `${entry.timestamp || ''}_${entry.level || ''}_${entry.message || ''}_${entry.stack || ''}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  }

  const list = Array.from(map.values());

  // Ordenar de más reciente a más antiguo
  list.sort((a, b) => {
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return 0;
  });

  return list.slice(0, Math.max(1, Math.min(50, limit)));
}

module.exports = {
  getRecentProblemLogs,
  readLogEntries,
  ERROR_LOG_PATH,
  COMBINED_LOG_PATH
};
