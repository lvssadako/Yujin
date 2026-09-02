const logger = require('../../utils/logger');
const { processAllGuildLoans } = require('./loanService');

let _scheduler = null;
let _earlyRun = null;

const INTERVAL_MS = 60 * 60 * 1000;      // Revisión horaria para procesar préstamos que cumplan sus 24h
const STARTUP_DELAY_MS = 10_000;         // 10 segundos tras arrancar para verificar préstamos pendientes

/**
 * Arranca el scheduler de intereses de préstamos.
 * Se llama una vez en ready, pasando el client de Discord.js.
 * @param {import('discord.js').Client} client
 */
function startLoanInterestScheduler(client) {
  if (_scheduler) return; // ya iniciado

  async function runTick() {
    try {
      if (!client || !client.guilds || !client.guilds.cache) return;
      const guilds = client.guilds.cache;
      let totalProcessed = 0;

      for (const [guildId] of guilds) {
        const count = processAllGuildLoans(guildId);
        totalProcessed += count;
      }

      if (totalProcessed > 0) {
        logger.info(`[LoanScheduler] Tick de interés completado. Préstamos actualizados: ${totalProcessed}`);
      }
    } catch (err) {
      logger.error('[LoanScheduler] Error en tick de interés', { error: err.message, stack: err.stack });
    }
  }

  // Ejecución inicial diferida (comprueba de forma segura sin duplicar si ya pasaron 24h)
  _earlyRun = setTimeout(runTick, STARTUP_DELAY_MS);

  // Ejecución periódica cada 1 hora
  _scheduler = setInterval(runTick, INTERVAL_MS);

  logger.info('[LoanScheduler] Scheduler de intereses iniciado (revisión horaria con ciclo de 24h por préstamo).');
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
