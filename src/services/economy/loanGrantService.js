const path = require('node:path');
const { createHash } = require('node:crypto');
const store = require('./loanPaymentStore');
const { applyLoanGrant, MIN_LOAN, MAX_LOAN } = require('./loanService');

function createLoanGrantService({ dataDir = path.join(__dirname, '../../..', 'data'), fault, now = Date.now } = {}) {
  function grant({ guildId, userId, source, deliveryId, amount }) {
    if (!store.validId(guildId) || !store.validId(userId) || !store.validId(deliveryId) ||
        !['slash', 'prefix'].includes(source)) {
      return { success: false, error: '❌ No se pudo identificar la solicitud. Usa el comando dentro de un servidor.' };
    }
    const fingerprint = typeof amount === 'string' ? amount.trim() : '';
    const key = createHash('sha256').update(JSON.stringify(['loan-take', guildId, userId, source, deliveryId])).digest('hex');
    // Comparte recuperación con pagos, incluidos pendientes v1, antes de leer saldos.
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
      journal.version = 2;
      store.reject(dataDir, journal, key, fingerprint, result, fault);
      return result;
    };
    const requested = /^\d+$/.test(fingerprint) ? Number(fingerprint) : NaN;
    if (!Number.isSafeInteger(requested) || requested <= 0) {
      return reject('❌ Especifica una cantidad válida (entre 500 y 100,000 🪙).');
    }
    if (requested < MIN_LOAN) return reject(`❌ El préstamo mínimo es **${MIN_LOAN.toLocaleString()} 🪙**.`);
    if (requested > MAX_LOAN) return reject(`❌ El préstamo máximo es **${MAX_LOAN.toLocaleString()} 🪙**.`);

    const economy = store.readState(path.join(dataDir, 'economy.json'));
    const loans = store.readState(path.join(dataDir, 'loans.json'));
    const wallet = store.entry(economy, guildId, userId);
    const loan = store.entry(loans, guildId, userId);
    if (loan?.active === true) return reject('❌ Ya tienes un préstamo activo. Págalo primero antes de solicitar uno nuevo.');
    if (loan !== null && (loan.active !== false || loan.balance !== 0)) throw new Error('Invalid inactive loan');
    const coins = wallet?.coins ?? 0;
    if (!Number.isSafeInteger(coins) || coins < 0 || !Number.isSafeInteger(coins + requested)) {
      throw new Error('Invalid economic amounts');
    }
    const createdAt = now();
    if (!Number.isSafeInteger(createdAt) || createdAt <= 0) throw new Error('Invalid loan clock');
    const afterLoan = structuredClone(loan ?? {});
    const projection = applyLoanGrant(afterLoan, requested, { now: createdAt });
    if (!projection.success) throw new Error('Invalid loan grant projection');
    const result = { ...projection, credited: requested, coins: coins + requested };
    const afterWallet = wallet === null ? { coins: 0, gems: 0, bank: 0, inventory: {} } : { ...wallet };
    afterWallet.coins = result.coins;
    store.prepare(dataDir, journal, {
      operation: 'loan-take', key, fingerprint, guildId, userId, result,
      economy: store.transition(path.join(dataDir, 'economy.json'), economy, wallet, afterWallet),
      loans: store.transition(path.join(dataDir, 'loans.json'), loans, loan, afterLoan)
    }, fault);
    return result;
  }
  return { grant: request => store.withLock(dataDir, () => grant(request), { fault }),
    recover: () => store.recover(dataDir, fault) };
}

module.exports = { createLoanGrantService, loanGrantService: createLoanGrantService() };
