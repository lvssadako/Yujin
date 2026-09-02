const os = require('node:os');
const fs = require('node:fs');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

function makeProgressBar(percent, length = 10) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const filled = Math.round((p / 100) * length);
  const empty = length - filled;
  return `\`[${'█'.repeat(filled)}${'░'.repeat(empty)}]\` **${p.toFixed(1)}%**`;
}

/**
 * Recopila las métricas de hardware y sistema de la máquina anfitriona (Ubuntu VM / Linux / Windows).
 * @param {import('discord.js').Client} client
 */
function getHostMetrics(client) {
  // 1. CPU
  const cpus = os.cpus() || [];
  const cpuModel = cpus[0]?.model || 'CPU Desconocida';
  const cpuCores = cpus.length;
  const cpuSpeed = cpus[0]?.speed || 0;
  const loadAvg = os.loadavg() || [0, 0, 0];

  // 2. Memoria RAM del Servidor
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const memPercent = totalMem > 0 ? ((usedMem / totalMem) * 100) : 0;

  // 3. Memoria del Proceso Node.js
  const procMem = process.memoryUsage();

  // 4. Almacenamiento en Disco (FS)
  let disk = null;
  try {
    if (typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(process.cwd());
      const totalDisk = stats.blocks * stats.bsize;
      const freeDisk = stats.bfree * stats.bsize;
      const usedDisk = Math.max(0, totalDisk - freeDisk);
      const diskPercent = totalDisk > 0 ? ((usedDisk / totalDisk) * 100) : 0;
      disk = {
        total: totalDisk,
        used: usedDisk,
        free: freeDisk,
        percent: diskPercent
      };
    }
  } catch {}

  // 5. Sistema Operativo
  const platform = os.platform();
  const type = os.type();
  const release = os.release();
  const arch = os.arch();
  const hostname = os.hostname();

  // 6. Tiempos de actividad (Uptime)
  const hostUptime = os.uptime();
  const botUptime = process.uptime();

  // 7. Latencia Discord
  const wsPing = client?.ws?.ping ?? -1;

  return {
    cpu: {
      model: cpuModel,
      cores: cpuCores,
      speedMHz: cpuSpeed,
      load1m: loadAvg[0].toFixed(2),
      load5m: loadAvg[1].toFixed(2),
      load15m: loadAvg[2].toFixed(2)
    },
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: memPercent,
      processRss: procMem.rss,
      heapUsed: procMem.heapUsed,
      heapTotal: procMem.heapTotal
    },
    disk,
    os: {
      platform,
      type,
      release,
      arch,
      hostname
    },
    uptime: {
      host: hostUptime,
      bot: botUptime
    },
    network: {
      wsPing
    }
  };
}

module.exports = {
  getHostMetrics,
  formatBytes,
  formatDuration,
  makeProgressBar
};
