const path = require('node:path');
const { createHash } = require('node:crypto');
const store = require('./loanPaymentStore');
const { applyRepayment, MAX_DEBT_MULTIPLIER } = require('./loanService');

function createLoanPaymentService({ dataDir = path.join(__dirname, '../../..', 'data'), fault } = {}) {
  function pay({ guildId, userId, source, deliveryId, amount }) {
    if (!store.validId(guildId) || !store.validId(userId) || !store.validId(deliveryId) ||
        !['slash', 'prefix'].includes(source)) {
      return { success: false, error: '❌ No se pudo identificar el pago. Usa el comando dentro de un servidor.' };
    }
    const fingerprint = typeof amount === 'string' ? amount.toLowerCase().trim() : '';
    const key = createHash('sha256').update(JSON.stringify(['loan-repay', guildId, userId, source, deliveryId])).digest('hex');
    const journal = store.recover(dataDir, fault);
    if (Object.hasOwn(journal.receipts, key)) {
      const receipt = journal.receipts[key];
      if (receipt.fingerprint !== fingerprint) {
        return { success: false, error: '❌ Esta solicitud ya fue registrada con otra cantidad. Envía un comando nuevo.' };
      }
      return { ...receipt.result, duplicate: true };
    }
    const reject = error => {
      const result = { success: false, error };
      store.reject(dataDir, journal, key, fingerprint, result, fault);
      return result;
    };
    const economy = store.readState(path.join(dataDir, 'economy.json'));
    const loans = store.readState(path.join(dataDir, 'loans.json'));
    const wallet = store.entry(economy, guildId, userId);
    const loan = store.entry(loans, guildId, userId);
    if (loan !== null && typeof loan.active !== 'boolean') throw new Error('Invalid loan active flag');
    if (loan?.active === false && loan.balance !== 0) throw new Error('Invalid inactive loan');
    if (loan === null || loan.active === false) return reject('✅ No tienes préstamos activos. ¡Estás libre de deudas!');
    const coins = wallet?.coins ?? 0;
    if (!Number.isSafeInteger(coins) || coins < 0 || !Number.isSafeInteger(loan.balance) || loan.balance <= 0 ||
        !Number.isSafeInteger(loan.principal) || loan.principal <= 0 ||
        loan.balance > Math.floor(loan.principal * MAX_DEBT_MULTIPLIER)) {
      throw new Error('Invalid economic amounts');
    }
    let paid;
    if (fingerprint === 'all' || fingerprint === 'todo') {
      paid = Math.min(coins, loan.balance);
    } else {
      const requested = /^\d+$/.test(fingerprint) ? Number(fingerprint) : NaN;
      if (!Number.isSafeInteger(requested) || requested <= 0) {
        return reject('❌ Especifica una cantidad válida o usa `all` para pagar todo.');
      }
      paid = Math.min(requested, loan.balance);
    }
    if (paid > coins) {
      return reject(`❌ No tienes suficientes monedas. Tienes **${coins.toLocaleString()} 🪙** y la deuda es **${loan.balance.toLocaleString()} 🪙**.`);
    }
    if (paid <= 0) return reject('❌ No tienes monedas para pagar.');
    const afterLoan = structuredClone(loan);
    const result = { ...applyRepayment(afterLoan, paid), coins: coins - paid };
    if (!result.success || result.paid !== paid) throw new Error('Invalid repayment projection');
    const pending = {
      key, fingerprint, guildId, userId, result,
      economy: store.transition(path.join(dataDir, 'economy.json'), economy, wallet, { ...wallet, coins: result.coins }),
      loans: store.transition(path.join(dataDir, 'loans.json'), loans, loan, afterLoan)
    };
    store.prepare(dataDir, journal, pending, fault);
    return result; // Solo después de confirmar ambas escrituras y el recibo.
  }
  return { pay: request => store.withLock(dataDir, () => pay(request), { fault }),
    recover: () => store.recover(dataDir, fault) };
}

module.exports = { createLoanPaymentService, loanPaymentService: createLoanPaymentService() };
