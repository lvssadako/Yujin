const logger = require('../../utils/logger');
const { processAllGuildLoans } = require('./loanService');

let _scheduler = null;
let _earlyRun = null;

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
const STARTUP_DELAY_MS = 10_000;           // 10 segundos tras arrancar

/**
 * Arranca el scheduler de intereses de préstamos.
 * Se llama una vez en ready, pasando el client de Discord.js.
 * @param {import('discord.js').Client} client
 */
function startLoanInterestScheduler(client) {
  if (_scheduler) return; // ya iniciado

  async function runTick() {
    try {
      const guilds = client.guilds.cache;
      let totalProcessed = 0;

      for (const [guildId] of guilds) {
        const count = processAllGuildLoans(guildId);
        totalProcessed += count;
      }

      if (totalProcessed > 0) {
        logger.info(`[LoanScheduler] Tick de interés completado. Préstamos procesados: ${totalProcessed}`);
      }
    } catch (err) {
      logger.error('[LoanScheduler] Error en tick de interés', { error: err.message, stack: err.stack });
    }
  }

  // Ejecución inicial diferida (por si el bot arrancó mientras había préstamos pendientes)
  _earlyRun = setTimeout(runTick, STARTUP_DELAY_MS);

  // Ejecución recurrente cada 24 horas
  _scheduler = setInterval(runTick, INTERVAL_MS);

  logger.info('[LoanScheduler] Scheduler de intereses iniciado (cada 24h).');
}

/**
 * Detiene el scheduler (para graceful shutdown).
 */
function stopLoanInterestScheduler() {
  if (_scheduler) {
    clearInterval(_scheduler);
    _scheduler = null;
  }
  if (_earlyRun) {
    clearTimeout(_earlyRun);
    _earlyRun = null;
  }
  logger.info('[LoanScheduler] Scheduler de intereses detenido.');
}

module.exports = { startLoanInterestScheduler, stopLoanInterestScheduler };
