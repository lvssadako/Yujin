const path = require('node:path');
const fs = require('node:fs');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const LOANS_PATH = path.join(DATA_DIR, 'loans.json');

// ─── Constantes de Configuración del Préstamo ────────────────────────────────
const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas por ciclo de interés
const MAX_CATCHUP_DAYS = 7;                   // Límite de días si el bot estuvo desconectado
const MAX_DEBT_MULTIPLIER = 2.5;              // Techo máximo de deuda (2.5x del monto prestado)

// ─── Tasas de interés según días transcurridos (ticks) ────────────────────────
// Ticks 1-3  → 5%   (inicio suave)
// Ticks 4-6  → 8%   (subida moderada)
// Ticks 7-10 → 12%  (urgente)
// Ticks 11+  → 18%  (crítico)
const INTEREST_SCHEDULE = [
  { minTick: 11, rate: 0.18 },
  { minTick: 7,  rate: 0.12 },
  { minTick: 4,  rate: 0.08 },
  { minTick: 0,  rate: 0.05 }
];

// ─── Umbrales de penalización (deuda / principal) ─────────────────────────────
// Level 0 → sin penalización        (deuda < 1.5x principal)
// Level 1 → advertencia             (deuda >= 1.5x principal)
// Level 2 → ingresos -50%           (deuda >= 2.0x principal)
// Level 3 → ingresos -75% y congelado en tope (deuda >= 2.5x principal)
const PENALTY_THRESHOLDS = [
  { level: 3, multiplier: 2.5 },
  { level: 2, multiplier: 2.0 },
  { level: 1, multiplier: 1.5 }
];

const MIN_LOAN = 500;
const MAX_LOAN = 100_000;

// ─── Helpers de IO ─────────────────────────────────────────────────────────────

function sanitizeLoanEntry(loan) {
  if (!loan || typeof loan !== 'object' || !loan.active) return loan;

  loan.principal = Math.max(0, Math.floor(Number(loan.principal) || 0));
  loan.balance = Math.max(0, Math.floor(Number(loan.balance) || 0));
  loan.tickCount = Math.max(0, Math.floor(Number(loan.tickCount) || 0));
  loan.createdAt = Number(loan.createdAt) || Date.now();
  loan.lastInterestTick = Number(loan.lastInterestTick) || loan.createdAt;

  const maxBalance = Math.floor(loan.principal * MAX_DEBT_MULTIPLIER);
  if (loan.balance > maxBalance) {
    loan.balance = maxBalance;
  }

  loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);
  loan.interestRate = getRateForTick(loan.tickCount);
  return loan;
}

function readLoans() {
  const data = readJsonSafe(LOANS_PATH, { guilds: {} });
  if (!data || typeof data !== 'object') return { guilds: {} };
  data.guilds = data.guilds || {};

  let needsSave = false;
  for (const guildId of Object.keys(data.guilds)) {
    const guild = data.guilds[guildId];
    if (guild && typeof guild === 'object') {
      for (const userId of Object.keys(guild)) {
        const entry = guild[userId];
        if (entry && entry.active) {
          const original = JSON.stringify(entry);
          sanitizeLoanEntry(entry);
          if (JSON.stringify(entry) !== original) {
            needsSave = true;
          }
        }
      }
    }
  }

  if (needsSave) {
    writeLoans(data);
  }

  return data;
}

function writeLoans(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeJsonAtomic(LOANS_PATH, data || { guilds: {} });
}

// ─── Inicializar entrada de usuario ────────────────────────────────────────────

function ensureUserLoan(data, guildId, userId) {
  data.guilds[guildId] = data.guilds[guildId] || {};
  data.guilds[guildId][userId] = data.guilds[guildId][userId] || {
    active: false,
    principal: 0,
    balance: 0,
    interestRate: 0.05,
    createdAt: 0,
    lastInterestTick: 0,
    penaltyLevel: 0,
    tickCount: 0
  };
  return data.guilds[guildId][userId];
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Obtiene el objeto de préstamo de un usuario (sin modificarlo).
 */
function getLoan(guildId, userId) {
  const data = readLoans();
  const guild = data.guilds[guildId] || {};
  return guild[userId] || null;
}

/**
 * Solicita un préstamo nuevo.
 * @returns {{ success: false, reason: string } | { success: true, loan: object }}
 */
function takeLoan(guildId, userId, amount) {
  const safeAmount = Math.floor(Number(amount));
  if (!Number.isFinite(safeAmount) || safeAmount < MIN_LOAN) {
    return { success: false, reason: `El préstamo mínimo es **${MIN_LOAN.toLocaleString()} 🪙**.` };
  }
  if (safeAmount > MAX_LOAN) {
    return { success: false, reason: `El préstamo máximo es **${MAX_LOAN.toLocaleString()} 🪙**.` };
  }

  const data = readLoans();
  const loan = ensureUserLoan(data, guildId, userId);

  if (loan.active) {
    return { success: false, reason: 'Ya tienes un préstamo activo. Págalo primero antes de solicitar uno nuevo.' };
  }

  const now = Date.now();
  loan.active = true;
  loan.principal = safeAmount;
  loan.balance = safeAmount;
  loan.interestRate = 0.05;
  loan.createdAt = now;
  loan.lastInterestTick = now;
  loan.penaltyLevel = 0;
  loan.tickCount = 0;

  writeLoans(data);
  return { success: true, loan: { ...loan } };
}

/**
 * Realiza un pago parcial o total del préstamo.
 * @returns {{ success: false, reason: string } | { success: true, paid: number, remaining: number, cleared: boolean, penaltyLevel: number }}
 */
function repayLoan(guildId, userId, amount) {
  const data = readLoans();
  const loan = ensureUserLoan(data, guildId, userId);

  if (!loan.active) {
    return { success: false, reason: 'No tienes un préstamo activo.' };
  }

  const safeAmount = Math.floor(Math.max(0, Number(amount)));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    return { success: false, reason: 'Monto de pago inválido.' };
  }

  const paid = Math.min(safeAmount, loan.balance);
  loan.balance -= paid;

  let cleared = false;
  if (loan.balance <= 0) {
    loan.balance = 0;
    loan.active = false;
    loan.penaltyLevel = 0;
    loan.principal = 0;
    loan.interestRate = 0.05;
    loan.tickCount = 0;
    loan.createdAt = 0;
    loan.lastInterestTick = 0;
    cleared = true;
  } else {
    // Al amortizar deuda, recalcular y reducir inmediatamente la penalización
    loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);
  }

  writeLoans(data);
  return { success: true, paid, remaining: loan.balance, cleared, penaltyLevel: loan.penaltyLevel };
}

/**
 * Calcula la tasa de interés según los ticks acumulados.
 */
function getRateForTick(tickCount) {
  for (const entry of INTEREST_SCHEDULE) {
    if (tickCount >= entry.minTick) return entry.rate;
  }
  return 0.05;
}

/**
 * Calcula el nivel de penalización según la proporción deuda/principal.
 */
function calcPenaltyLevel(balance, principal) {
  if (!principal || principal <= 0) return 0;
  const ratio = balance / principal;
  for (const { level, multiplier } of PENALTY_THRESHOLDS) {
    if (ratio >= multiplier) return level;
  }
  return 0;
}

/**
 * Aplica un tick de interés a un préstamo individual.
 * @param {string} guildId
 * @param {string} userId
 * @param {object} [options]
 * @param {boolean} [options.force=true] Si es false, respeta el intervalo de 24h
 * @param {number} [options.now=Date.now()]
 * @returns {{ interestAdded: number, newBalance: number, newRate: number, penaltyLevel: number, isCapped?: boolean, skipped?: boolean } | null}
 */
function applyInterestTick(guildId, userId, { force = true, now = Date.now() } = {}) {
  const data = readLoans();
  const loan = ensureUserLoan(data, guildId, userId);

  if (!loan.active) return null;

  // Si no se fuerza, verificar si han transcurrido 24 horas
  if (!force && loan.lastInterestTick > 0) {
    const elapsed = now - loan.lastInterestTick;
    if (elapsed < TICK_INTERVAL_MS) {
      return {
        interestAdded: 0,
        newBalance: loan.balance,
        newRate: loan.interestRate,
        penaltyLevel: loan.penaltyLevel,
        isCapped: loan.balance >= Math.floor(loan.principal * MAX_DEBT_MULTIPLIER),
        skipped: true
      };
    }
  }

  const maxBalance = Math.floor(loan.principal * MAX_DEBT_MULTIPLIER);

  if (loan.balance >= maxBalance) {
    loan.balance = maxBalance;
    loan.lastInterestTick = now;
    loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);
    writeLoans(data);
    return {
      interestAdded: 0,
      newBalance: loan.balance,
      newRate: loan.interestRate,
      penaltyLevel: loan.penaltyLevel,
      isCapped: true
    };
  }

  loan.tickCount = (loan.tickCount || 0) + 1;
  loan.interestRate = getRateForTick(loan.tickCount);

  const rawInterest = Math.ceil(loan.balance * loan.interestRate);
  const roomToCap = Math.max(0, maxBalance - loan.balance);
  const interestAdded = Math.min(rawInterest, roomToCap);

  loan.balance += interestAdded;
  loan.lastInterestTick = now;
  loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);

  writeLoans(data);
  return {
    interestAdded,
    newBalance: loan.balance,
    newRate: loan.interestRate,
    penaltyLevel: loan.penaltyLevel,
    isCapped: loan.balance >= maxBalance
  };
}

/**
 * Procesa todos los préstamos activos de un servidor de manera atómica y controlada por tiempo.
 * @param {string} guildId
 * @param {number} [now=Date.now()]
 * @returns {number} cantidad de préstamos a los que se les aplicó interés
 */
function processAllGuildLoans(guildId, now = Date.now()) {
  const data = readLoans();
  const guild = data.guilds[guildId];
  if (!guild || typeof guild !== 'object') return 0;

  let processed = 0;
  let modified = false;

  for (const userId of Object.keys(guild)) {
    const loan = guild[userId];
    if (!loan || !loan.active) continue;

    const lastTick = loan.lastInterestTick || loan.createdAt || 0;
    const elapsed = now - lastTick;

    // Si aún no han transcurrido 24 horas, no hacer nada
    if (elapsed < TICK_INTERVAL_MS) continue;

    const maxBalance = Math.floor(loan.principal * MAX_DEBT_MULTIPLIER);
    const elapsedDays = Math.min(Math.floor(elapsed / TICK_INTERVAL_MS), MAX_CATCHUP_DAYS);

    if (elapsedDays <= 0) continue;

    for (let d = 0; d < elapsedDays; d++) {
      if (loan.balance < maxBalance) {
        loan.tickCount = (loan.tickCount || 0) + 1;
        loan.interestRate = getRateForTick(loan.tickCount);

        const rawInterest = Math.ceil(loan.balance * loan.interestRate);
        const roomToCap = Math.max(0, maxBalance - loan.balance);
        const interestAdded = Math.min(rawInterest, roomToCap);

        loan.balance += interestAdded;
      }
    }

    loan.lastInterestTick = now;
    loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);
    processed++;
    modified = true;
  }

  if (modified) {
    writeLoans(data);
  }

  return processed;
}

/**
 * Devuelve un resumen legible del préstamo de un usuario.
 */
function getUserLoanSummary(guildId, userId, now = Date.now()) {
  const loan = getLoan(guildId, userId);
  if (!loan || !loan.active) {
    return { active: false };
  }

  const maxBalance = Math.floor(loan.principal * MAX_DEBT_MULTIPLIER);
  const isCapped = loan.balance >= maxBalance;
  const lastTick = loan.lastInterestTick || loan.createdAt || now;
  const elapsed = Math.max(0, now - lastTick);
  const msUntilNextTick = isCapped ? 0 : Math.max(0, TICK_INTERVAL_MS - (elapsed % TICK_INTERVAL_MS));
  const daysOverdue = loan.tickCount || 0;

  return {
    active: true,
    principal: loan.principal,
    balance: loan.balance,
    interestRate: loan.interestRate,
    tickCount: loan.tickCount,
    penaltyLevel: loan.penaltyLevel,
    maxBalance,
    isCapped,
    msUntilNextTick,
    createdAt: loan.createdAt,
    lastInterestTick: loan.lastInterestTick,
    daysOverdue
  };
}

module.exports = {
  getLoan,
  takeLoan,
  repayLoan,
  applyInterestTick,
  processAllGuildLoans,
  getUserLoanSummary,
  calcPenaltyLevel,
  getRateForTick,
  TICK_INTERVAL_MS,
  MAX_DEBT_MULTIPLIER,
  PENALTY_THRESHOLDS,
  INTEREST_SCHEDULE,
  MIN_LOAN,
  MAX_LOAN
};
