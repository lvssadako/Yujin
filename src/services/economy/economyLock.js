const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// Bakery de Lamport sobre registros publicados por rename en un disco local.
// Cada solicitud es dueña de un nombre irrepetible: nunca se borra un nombre
// compartido que otro proceso pueda haber reutilizado para adquirir el bloqueo.
const frames = []; // Solo llamadas síncronas activas; limpieza incondicional en finally.
const pause = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
const pattern = /^([1-9]\d*)-([a-f0-9-]{36})\.json$/;

function retryIO(action) {
  for (let attempt = 0; ; attempt++) {
    try { return action(); }
    catch (error) {
      if (attempt === 4 || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

function unlink(file) {
  try { retryIO(() => fs.unlinkSync(file)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function publish(file, claim) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(claim), { mode: 0o600 });
  retryIO(() => fs.renameSync(tmp, file));
}

function claims(dir) {
  const result = [];
  for (const name of fs.readdirSync(dir)) {
    const match = pattern.exec(name);
    if (!match) continue;
    const file = path.join(dir, name);
    let claim;
    try { claim = JSON.parse(retryIO(() => fs.readFileSync(file, 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!claim || claim.host !== os.hostname() || claim.pid !== Number(match[1]) ||
        claim.id !== name || typeof claim.choosing !== 'boolean' ||
        !Number.isSafeInteger(claim.ticket) || claim.ticket < 0) {
      throw new Error('Invalid or foreign economic lock owner');
    }
    if (!alive(claim.pid)) {
      // Ese nombre pertenece únicamente al proceso muerto. Dos limpiadores
      // pueden borrarlo sin riesgo de borrar el turno nuevo de otro proceso.
      unlink(file);
      unlink(`${file}.tmp`);
      unlink(`${file}.ticket`);
      unlink(`${file}.ticket.tmp`);
      continue;
    }
    // Dos registros inmutables evitan reemplazar un archivo abierto por lectores
    // de Windows. La presencia del segundo finaliza la elección del turno.
    try {
      const selected = JSON.parse(retryIO(() => fs.readFileSync(`${file}.ticket`, 'utf8')));
      if (!selected || selected.id !== claim.id || selected.pid !== claim.pid || selected.host !== claim.host ||
          selected.choosing !== false || !Number.isSafeInteger(selected.ticket) || selected.ticket < 1) {
        throw new Error('Invalid economic lock ticket');
      }
      claim = selected;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    result.push(claim);
  }
  return result;
}

function withLock(dataDir, action, { timeoutMs = 5000, fault = () => {} } = {}) {
  if (typeof action !== 'function' || action.constructor.name === 'AsyncFunction') {
    throw new Error('Economic lock requires a synchronous operation');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid economic lock timeout');
  fs.mkdirSync(dataDir, { recursive: true });
  const canonical = fs.realpathSync.native(dataDir);
  const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  if (frames.includes(key)) return action();
  const lockDir = path.join(canonical, '.economy-lock');
  fs.mkdirSync(lockDir, { recursive: true });
  if (!fs.lstatSync(lockDir).isDirectory()) throw new Error('Invalid economic lock directory');
  const id = `${process.pid}-${randomUUID()}.json`;
  const file = path.join(lockDir, id);
  const claim = { id, pid: process.pid, host: os.hostname(), choosing: true, ticket: 0 };
  const deadline = performance.now() + timeoutMs;
  let entered = false;
  try {
    fault('lock:before-register');
    publish(file, claim);
    fault('lock:after-register');
    claim.ticket = 1 + claims(lockDir).reduce((max, other) => Math.max(max, other.ticket), 0);
    if (!Number.isSafeInteger(claim.ticket)) throw new Error('Economic lock ticket overflow');
    claim.choosing = false;
    publish(`${file}.ticket`, claim);
    fault('lock:after-ticket');
    while (true) {
      const blocked = claims(lockDir).some(other => other.id !== id && (other.choosing ||
        (other.ticket !== 0 && (other.ticket < claim.ticket || (other.ticket === claim.ticket && other.id < id)))));
      if (!blocked) break;
      if (performance.now() >= deadline) throw new Error('Economic storage busy; retry the same delivery');
      pause();
    }
    frames.push(key);
    entered = true;
    fault('lock:entered');
    const result = action();
    if (result && typeof result.then === 'function') throw new Error('Async economic operation escaped its lock');
    return result;
  } finally {
    if (entered) frames.pop();
    unlink(file);
    unlink(`${file}.tmp`);
    unlink(`${file}.ticket`);
    unlink(`${file}.ticket.tmp`);
  }
}

module.exports = { withLock };
