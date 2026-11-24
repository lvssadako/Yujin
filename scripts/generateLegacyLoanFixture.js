// Genera src/services/economy/__tests__/fixtures/legacy-loan-payment-v1.json.
//
// NO contiene datos reales de producción: se produce ejecutando el servicio de pagos actual, que aún
// escribe el diario en formato v1, y deteniéndolo justo después de persistir un pago pendiente
// (prepared:after-rename). Así el archivo tiene la estructura exacta que el código v1 deja en disco.
// Uso: node scripts/generateLegacyLoanFixture.js
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../src/services/economy/__tests__/fixtures/loan-payment-fixture');

const cleanups = [];
const t = { after: fn => cleanups.push(fn) };
const out = path.join(__dirname, '..', 'src', 'services', 'economy', '__tests__', 'fixtures', 'legacy-loan-payment-v1.json');

try {
  // 5000 monedas y un préstamo de 1000 con deuda de 1050 (principal + 5 % inicial).
  const f = fixture(t, 5000, { withLoan: true });

  // Un pago ya completado de OTRO usuario: su recibo debe seguir siendo reconocido como duplicado tras migrar.
  const other = 'synthetic-other-user';
  f.economy.addCoins(f.guild, other, 2000);
  if (!f.loans.takeLoan(f.guild, other, 1000).success) throw new Error('No se pudo crear el préstamo auxiliar');
  const completedRequest = { guildId: f.guild, userId: other, source: 'slash', deliveryId: 'delivery-completed', amount: '100' };
  if (!f.service.pay(completedRequest).success) throw new Error('El pago auxiliar debía completarse');

  // El pago pendiente del usuario principal: se interrumpe con el diario ya persistido y sin tocar saldos.
  const interrupted = f.createLoanPaymentService({
    dataDir: f.dataDir,
    fault(point) { if (point === 'prepared:after-rename') throw new Error('synthetic interruption'); }
  });
  try { interrupted.pay(f.request); throw new Error('El pago debía interrumpirse'); }
  catch (error) { if (error.message !== 'synthetic interruption') throw error; }

  const journal = f.raw('loan-payments');
  if (journal.version !== 1 || !journal.pending) throw new Error('Se esperaba un diario v1 con un pago pendiente');
  const data = {
    _note: 'Generado por scripts/generateLegacyLoanFixture.js con el servicio de pagos actual (formato v1). No son datos de producción.',
    request: f.request,
    completedRequest,
    economy: f.raw('economy'),
    loans: f.raw('loans'),
    journal
  };
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log('Fixture generado:', out, fs.statSync(out).size, 'bytes');
} finally {
  for (const fn of cleanups.reverse()) fn();
}
