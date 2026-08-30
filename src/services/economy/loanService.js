const path = require('node:path');
const fs = require('node:fs');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const LOANS_PATH = path.join(DATA_DIR, 'loans.json');

// ─── Tasas de interés según días transcurridos (ticks) ────────────────────────
// Ticks 1-3  → 5%   (inicio suave)
// Ticks 4-6  → 8%   (empieza a subir)
// Ticks 7-10 → 12%  (urgente)
// Ticks 11+  → 18%  (crítico)
const INTEREST_SCHEDULE = [
  { minTick: 11, rate: 0.18 },
  { minTick: 7,  rate: 0.12 },
  { minTick: 4,  rate: 0.08 },
  { minTick: 0,  rate: 0.05 }
];

// ─── Umbrales de penalización (deuda / principal) ─────────────────────────────
// Level 0 → sin penalización
// Level 1 → advertencia         (deuda >= 2x principal)
// Level 2 → ingresos -50%       (deuda >= 3x principal)
// Level 3 → ingresos -75%       (deuda >= 5x principal)
const PENALTY_THRESHOLDS = [
  { level: 3, multiplier: 5 },
  { level: 2, multiplier: 3 },
  { level: 1, multiplier: 2 }
];

const MIN_LOAN = 500;
const MAX_LOAN = 100_000;

// ─── Helpers de IO ─────────────────────────────────────────────────────────────

function readLoans() {
  const data = readJsonSafe(LOANS_PATH, { guilds: {} });
  if (!data || typeof data !== 'object') return { guilds: {} };
  data.guilds = data.guilds || {};
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
 * @returns {{ success: false, reason: string } | { success: true, paid: number, remaining: number, cleared: boolean }}
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
    cleared = true;
  }

  writeLoans(data);
  return { success: true, paid, remaining: loan.balance, cleared };
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
 * Aplica un tick de interés a un préstamo activo.
 * Debe llamarse una vez por día (desde el scheduler).
 * @returns {{ interestAdded: number, newBalance: number, newRate: number, penaltyLevel: number }}
 */
function applyInterestTick(guildId, userId) {
  const data = readLoans();
  const loan = ensureUserLoan(data, guildId, userId);

  if (!loan.active) return null;

  loan.tickCount = (loan.tickCount || 0) + 1;
  loan.interestRate = getRateForTick(loan.tickCount);

  const interestAdded = Math.ceil(loan.balance * loan.interestRate);
  loan.balance += interestAdded;
  loan.lastInterestTick = Date.now();
  loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);

  writeLoans(data);
  return {
    interestAdded,
    newBalance: loan.balance,
    newRate: loan.interestRate,
    penaltyLevel: loan.penaltyLevel
  };
}

/**
 * Procesa todos los préstamos activos de un servidor.
 * @returns {number} cantidad de préstamos procesados
 */
function processAllGuildLoans(guildId) {
  const data = readLoans();
  const guild = data.guilds[guildId] || {};
  let processed = 0;

  for (const userId of Object.keys(guild)) {
    const loan = guild[userId];
    if (loan && loan.active) {
      // applyInterestTick lee y escribe individualmente
      applyInterestTick(guildId, userId);
      processed++;
    }
  }

  return processed;
}

/**
 * Devuelve un resumen legible del préstamo de un usuario.
 */
function getUserLoanSummary(guildId, userId) {
  const loan = getLoan(guildId, userId);
  if (!loan || !loan.active) {
    return { active: false };
  }

  const dayMs = 86400000;
  const daysOverdue = loan.tickCount || 0;

  return {
    active: true,
    principal: loan.principal,
    balance: loan.balance,
    interestRate: loan.interestRate,
    tickCount: loan.tickCount,
    penaltyLevel: loan.penaltyLevel,
    daysOverdue
  };
}

module.exports = {
  getLoan,
  takeLoan,
  repayLoan,
  applyInterestTick,
  processAllGuildLoans,
  getUserLoanSummary
};
