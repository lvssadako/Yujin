const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { withLock } = require('./economyLock');
const { applyLoanGrant, applyRepayment, MIN_LOAN, MAX_LOAN, MAX_DEBT_MULTIPLIER } = require('./loanRules');

const JOURNAL = 'loan-payments.json';
const REVISION = '_loanPaymentRevision';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const natural = value => Number.isSafeInteger(value) && value >= 0;
const amountOf = value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;

function requireStateFiles(dir) {
  for (const name of ['economy', 'loans']) {
    const file = path.join(dir, `${name}.json`);
    if (!fs.statSync(file).isFile()) throw new Error('Missing economic state file');
    readState(file);
  }
}

function emptyJournal(dir) {
  for (const name of ['economy', 'loans']) {
    const state = read(path.join(dir, `${name}.json`), null);
    if (object(state) && Object.hasOwn(state, REVISION)) throw new Error('Missing loan journal with existing revisions');
  }
  return { version: 1, receipts: {}, pending: null };
}

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error; // Un estado ilegible nunca equivale a un estado vacío.
  }
}

function readState(file) {
  const data = read(file, { guilds: {} });
  if (!object(data) || !object(data.guilds) ||
      (data[REVISION] !== undefined && typeof data[REVISION] !== 'string')) {
    throw new Error('Invalid loan payment state');
  }
  return data;
}

function readJournal(dir) {
  const stored = read(path.join(dir, JOURNAL), undefined);
  const journal = stored === undefined ? emptyJournal(dir) : stored;
  if (!object(journal) || ![1, 2].includes(journal.version) || !object(journal.receipts) ||
      !(journal.pending === null || object(journal.pending))) {
    throw new Error('Invalid loan payment journal');
  }
  for (const [key, receipt] of Object.entries(journal.receipts)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !object(receipt) ||
        typeof receipt.fingerprint !== 'string' || !object(receipt.result) ||
        typeof receipt.result.success !== 'boolean') throw new Error('Invalid payment receipt');
    validateResult(receipt.result);
  }
  return journal;
}

function validateResult(result) {
  if (!object(result)) throw new Error('Invalid loan result');
  if (result.success === false) {
    if (typeof result.error !== 'string' || !result.error ||
        !isDeepStrictEqual(result, { success: false, error: result.error })) throw new Error('Invalid rejected receipt');
    return;
  }
  if (result.success !== true || !natural(result.coins)) throw new Error('Invalid successful receipt');
  if (Object.hasOwn(result, 'credited')) {
    if (!natural(result.credited) || result.credited < MIN_LOAN || result.credited > MAX_LOAN ||
        !object(result.loan) || !natural(result.loan.createdAt) || result.loan.createdAt === 0) {
      throw new Error('Invalid grant receipt');
    }
    const loan = { ...result.loan, active: false };
    const projected = applyLoanGrant(loan, result.credited, { now: result.loan.createdAt });
    if (!isDeepStrictEqual(result, { ...projected, credited: result.credited, coins: result.coins })) {
      throw new Error('Invalid grant receipt projection');
    }
  } else {
    if (!natural(result.paid) || result.paid === 0 || !natural(result.remaining) ||
        !natural(result.penaltyLevel) || result.penaltyLevel > 3 ||
        (result.remaining === 0 && result.penaltyLevel !== 0) ||
        !isDeepStrictEqual(result, { success: true, paid: result.paid, remaining: result.remaining,
          cleared: result.remaining === 0, penaltyLevel: result.penaltyLevel, coins: result.coins })) {
      throw new Error('Invalid payment receipt');
    }
  }
}

function renameWithRetry(from, to, beforeAttempt = () => {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    beforeAttempt();
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (attempt === 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

// Solo se garantiza recuperación tras caída del proceso con un único escritor.
// No hay fallback de copia: un rename fallido conserva el destino anterior.
function write(file, data, stage, fault = () => {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.loan-payment.tmp`;
  fault(`${stage}:before-write`);
  const fd = fs.openSync(temporary, 'w', 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fault(`${stage}:after-sync`);
  fault(`${stage}:before-rename`);
  renameWithRetry(temporary, file);
  fault(`${stage}:after-rename`);
}

function entry(data, guildId, userId) {
  const guild = data.guilds[guildId];
  if (guild !== undefined && !object(guild)) throw new Error('Invalid economic guild');
  const user = guild?.[userId] ?? null;
  if (user !== null && !object(user)) throw new Error('Invalid economic user');
  return user;
}

function validatePending(pending) {
  if (!object(pending) || !/^[a-f0-9]{64}$/.test(pending.key) ||
      !validId(pending.guildId) || !validId(pending.userId) ||
      typeof pending.fingerprint !== 'string' || pending.result?.success !== true) {
    throw new Error('Invalid pending payment');
  }
  validateResult(pending.result);
  const operation = pending.operation === undefined ? 'loan-repay' : pending.operation;
  if (!['loan-repay', 'loan-take'].includes(operation)) throw new Error('Unknown loan operation');
  for (const kind of ['economy', 'loans']) {
    const side = pending[kind];
    if (!object(side) || !(object(side.before) || (operation === 'loan-take' && side.before === null)) || !object(side.after) ||
        !(side.beforeRevision === null || typeof side.beforeRevision === 'string') ||
        typeof side.afterRevision !== 'string' || !side.afterRevision || side.beforeRevision === side.afterRevision ||
        (side.fileExisted !== undefined && typeof side.fileExisted !== 'boolean') ||
        (side.fileExisted === false && (side.before !== null || side.beforeRevision !== null))) {
      throw new Error('Invalid payment transition');
    }
  }
  const beforeCoins = pending.economy.before?.coins ?? 0;
  if (!natural(beforeCoins)) throw new Error('Invalid prior wallet');
  const wallet = pending.economy.before === null
    ? { coins: 0, gems: 0, bank: 0, inventory: {} } : structuredClone(pending.economy.before);
  const loan = structuredClone(pending.loans.before ?? {});
  let expected;
  if (operation === 'loan-take') {
    const amount = amountOf(pending.fingerprint);
    if (!natural(amount) || amount < MIN_LOAN || amount > MAX_LOAN || !natural(beforeCoins + amount) ||
        (pending.loans.before !== null && (loan.active !== false || loan.balance !== 0))) {
      throw new Error('Invalid grant transition');
    }
    const projected = applyLoanGrant(loan, amount, { now: pending.result.loan?.createdAt });
    wallet.coins = beforeCoins + amount;
    expected = { ...projected, credited: amount, coins: wallet.coins };
  } else {
    if (loan.active !== true || !natural(loan.balance) || loan.balance === 0 ||
        !natural(loan.principal) || loan.principal === 0 || loan.balance > Math.floor(loan.principal * MAX_DEBT_MULTIPLIER)) {
      throw new Error('Invalid prior loan');
    }
    const requested = ['all', 'todo'].includes(pending.fingerprint) ? beforeCoins : amountOf(pending.fingerprint);
    if (!natural(requested) || requested === 0) throw new Error('Invalid payment fingerprint');
    const paid = Math.min(requested, loan.balance);
    if (paid > beforeCoins) throw new Error('Insufficient prior funds');
    const projected = applyRepayment(loan, paid);
    wallet.coins = beforeCoins - paid;
    expected = { ...projected, coins: wallet.coins };
  }
  // Comprobar la transición completa: dinero, campos ajenos, fechas y penalizaciones.
  if (!isDeepStrictEqual(pending.economy.after, wallet) || !isDeepStrictEqual(pending.loans.after, loan) ||
      !isDeepStrictEqual(pending.result, expected)) throw new Error('Inconsistent loan projection');
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) &&
    !['__proto__', 'constructor', 'prototype'].includes(value);
}

function inspectSide(dir, pending, kind) {
  const file = path.join(dir, `${kind}.json`);
  const side = pending[kind];
  if (side.fileExisted === true && !fs.statSync(file).isFile()) throw new Error('Missing prior economic file');
  const data = readState(file);
  // El marcador se guarda en el mismo rename que el cambio económico.
  if (data[REVISION] === side.afterRevision) {
    if (!isDeepStrictEqual(entry(data, pending.guildId, pending.userId), side.after)) {
      throw new Error('Payment recovery conflict; applied entry changed');
    }
    return null;
  }
  if ((data[REVISION] ?? null) !== side.beforeRevision ||
      !isDeepStrictEqual(entry(data, pending.guildId, pending.userId), side.before)) {
    throw new Error('Payment recovery conflict; state left unchanged');
  }
  return data;
}

function applySide(dir, pending, kind, fault) {
  const data = inspectSide(dir, pending, kind);
  if (!data) return;
  const file = path.join(dir, `${kind}.json`);
  const side = pending[kind];
  if (!Object.hasOwn(data.guilds, pending.guildId)) data.guilds[pending.guildId] = {};
  data.guilds[pending.guildId][pending.userId] = side.after;
  data[REVISION] = side.afterRevision;
  write(file, data, kind === 'economy' ? 'wallet' : 'loan', fault);
}

function recover(dir, fault) {
  const journal = readJournal(dir);
  if (Object.values(journal.receipts).some(receipt => receipt.result.success)) requireStateFiles(dir);
  const pending = journal.pending;
  if (!pending) return journal;
  validatePending(pending);
  if (pending.operation === 'loan-take' && journal.version !== 2) throw new Error('Loan grant requires journal v2');
  if (Object.hasOwn(journal.receipts, pending.key)) throw new Error('Conflicting payment receipt');
  // Detectar conflictos en ambos destinos antes de realizar otra escritura.
  inspectSide(dir, pending, 'economy');
  inspectSide(dir, pending, 'loans');
  applySide(dir, pending, 'economy', fault);
  applySide(dir, pending, 'loans', fault);
  journal.receipts[pending.key] = { fingerprint: pending.fingerprint, result: pending.result };
  journal.pending = null;
  write(path.join(dir, JOURNAL), journal, 'committed', fault);
  return journal;
}

function prepare(dir, journal, pending, fault) {
  validatePending(pending);
  if (pending.operation === 'loan-take') journal.version = 2;
  journal.pending = pending;
  write(path.join(dir, JOURNAL), journal, 'prepared', fault);
  return recover(dir, fault);
}

function reject(dir, journal, key, fingerprint, result, fault) {
  journal.receipts[key] = { fingerprint, result };
  write(path.join(dir, JOURNAL), journal, 'rejected', fault);
}

function managed(file) {
  return typeof file === 'string' && ['economy.json', 'loans.json'].includes(path.basename(file).toLowerCase());
}

function transition(file, state, before, after) {
  return { beforeRevision: state[REVISION] ?? null, afterRevision: randomUUID(),
    fileExisted: fs.existsSync(file), before, after };
}

function readManaged(file) {
  recover(path.dirname(file));
  return readState(file);
}

function writeManaged(file, data) {
  recover(path.dirname(file));
  const current = readState(file);
  if (!object(data) || !object(data.guilds) ||
      (data[REVISION] ?? null) !== (current[REVISION] ?? null)) {
    throw new Error('Stale economic state; read again before writing');
  }
  const revision = randomUUID();
  if (!fs.existsSync(path.join(path.dirname(file), JOURNAL))) {
    write(path.join(path.dirname(file), JOURNAL), emptyJournal(path.dirname(file)), 'initialized');
  }
  write(file, { ...data, [REVISION]: revision }, 'writer');
  data[REVISION] = revision;
  return file;
}

module.exports = {
  REVISION, validId, readState, entry, transition, managed, renameWithRetry, withLock,
  recover: (dir, fault) => withLock(dir, () => recover(dir, fault), { fault }),
  prepare: (dir, journal, pending, fault) => withLock(dir, () => prepare(dir, journal, pending, fault)),
  reject: (dir, journal, key, fingerprint, result, fault) => withLock(dir, () => reject(dir, journal, key, fingerprint, result, fault)),
  readManaged: file => withLock(path.dirname(file), () => readManaged(file)),
  writeManaged: (file, data) => withLock(path.dirname(file), () => writeManaged(file, data))
};
