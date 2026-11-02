// Reglas y proyecciones puras compartidas por ejecución y validación de recuperación.
// No dependen de IO ni alteran las reglas de intereses existentes.

const MAX_DEBT_MULTIPLIER = 2.5;    // Techo máximo de deuda (2.5x del monto prestado)
const INITIAL_INTEREST_RATE = 0.05; // Tasa de interés inicial (5% de apertura)
const MIN_LOAN = 500;
const MAX_LOAN = 100_000;

// Nivel 0: sin penalización; 1: advertencia; 2: ingresos -50%; 3: ingresos -75%.
const PENALTY_THRESHOLDS = [
  { level: 3, multiplier: 2.5 },
  { level: 2, multiplier: 2.0 },
  { level: 1, multiplier: 1.5 }
];

// Calcula el nivel de penalización según la proporción deuda/principal.
function calcPenaltyLevel(balance, principal) {
  if (!principal || principal <= 0) return 0;
  const ratio = balance / principal;
  for (const { level, multiplier } of PENALTY_THRESHOLDS) {
    if (ratio >= multiplier) return level;
  }
  return 0;
}

function applyLoanGrant(loan, safeAmount, options = {}) {
  if (loan.active) {
    return { success: false, reason: 'Ya tienes un préstamo activo. Págalo primero antes de solicitar uno nuevo.' };
  }

  const now = options.now !== undefined ? Number(options.now) : Date.now();
  const initialRate = options.initialInterestRate !== undefined ? Number(options.initialInterestRate) : INITIAL_INTEREST_RATE;
  const initialInterest = Math.ceil(safeAmount * initialRate);

  loan.active = true;
  loan.principal = safeAmount;
  loan.initialInterest = initialInterest;
  loan.balance = safeAmount + initialInterest;
  loan.interestRate = 0.05;
  loan.createdAt = now;
  loan.lastInterestTick = now;
  loan.tickCount = 0;
  loan.transferredWithActiveLoan = 0;
  loan.xpPenaltyApplied = 0;
  loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);

  return { success: true, loan: { ...loan }, initialInterest };
}

function applyRepayment(loan, amount) {
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
    loan.initialInterest = 0;
    loan.interestRate = 0.05;
    loan.tickCount = 0;
    loan.createdAt = 0;
    loan.lastInterestTick = 0;
    loan.transferredWithActiveLoan = 0;
    loan.xpPenaltyApplied = 0;
    cleared = true;
  } else {
    // Al amortizar deuda, recalcular y reducir inmediatamente la penalización
    loan.penaltyLevel = calcPenaltyLevel(loan.balance, loan.principal);
  }

  return { success: true, paid, remaining: loan.balance, cleared, penaltyLevel: loan.penaltyLevel };
}

module.exports = {
  MAX_DEBT_MULTIPLIER, INITIAL_INTEREST_RATE, MIN_LOAN, MAX_LOAN,
  PENALTY_THRESHOLDS, calcPenaltyLevel, applyLoanGrant, applyRepayment
};
