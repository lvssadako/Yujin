const rules = [
  { name: 'admin', check: ctx => ctx.user.isAdmin, multiplier: 2 },
  { name: 'unusualHour', check: ctx => ctx.isUnusualHour, multiplier: 1.5 },
  { name: 'firstTime', check: ctx => ctx.isFirstTimeAction, multiplier: 0.5 },
  { name: 'unusualDay', check: ctx => ctx.isUnusualDay, multiplier: 1.2 },
  { name: 'anomalousSpeed', check: ctx => ctx.isAnomalousSpeed, multiplier: 2 },
  // Puedes agregar más reglas aquí
];

function calculateRiskScore(ctx) {
  let score = ctx.basePoints;
  for (const rule of rules) {
    if (rule.check(ctx)) score *= rule.multiplier;
  }
  return score;
}

module.exports = { calculateRiskScore, rules };