const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_RECORDS = 10000;
const MAX_STORE_BYTES = 4 * 1024 * 1024;

// All deployment state IO lives here. Never recover corrupt state with defaults,
// expire an active lock, or fall back from rename to a non-atomic copy.
function createDeliveryStore(directory) {
  const dir = path.resolve(directory);
  const statePath = path.join(dir, 'deliveries.json');
  const lockPath = path.join(dir, 'deployment.lock');

  function read() {
    let raw;
    try {
      if (fs.statSync(statePath).size > MAX_STORE_BYTES) throw new Error('Delivery store too large');
      raw = fs.readFileSync(statePath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return { version: 1, records: [] };
      throw err;
    }
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !Array.isArray(data.records) || data.records.length > MAX_RECORDS ||
        data.records.some(r => !r || !/^[a-f0-9]{64}$/.test(r.id) || !/^[a-f0-9]{64}$/.test(r.digest) ||
          !['pending', 'completed', 'failed'].includes(r.status) || !Number.isFinite(r.createdAt))) {
      throw new Error('Invalid delivery store');
    }
    return data;
  }

  function write(data) {
    const tmp = path.join(dir, `deliveries.${crypto.randomUUID()}.tmp`);
    let fd;
    try {
      fd = fs.openSync(tmp, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(data));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, statePath);
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(tmp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    }
  }

  function reserve(deliveryId, digest) {
    if (typeof deliveryId !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(deliveryId) ||
        typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid delivery identity');
    fs.mkdirSync(dir, { recursive: true });
    let fd;
    try { fd = fs.openSync(lockPath, 'wx', 0o600); }
    catch (err) {
      if (err.code === 'EEXIST') return { status: 'busy' };
      throw err;
    }
    // The lock also protects independent service instances using this directory.
    // On any uncertain IO failure leave it in place for operator recovery.
    try {
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    const data = read();
    if (data.records.some(r => r.status === 'pending')) return { status: 'blocked' };
    const id = crypto.createHash('sha256').update(deliveryId).digest('hex');
    if (data.records.some(r => r.id === id || r.digest === digest)) {
      fs.unlinkSync(lockPath);
      return { status: 'duplicate' };
    }
    if (data.records.length >= MAX_RECORDS) return { status: 'blocked' };
    const record = { id, digest, status: 'pending', createdAt: Date.now() };
    data.records.push(record);
    write(data);
    let finished = false;
    return {
      status: 'accepted',
      finish(status) {
        if (finished || !['completed', 'failed'].includes(status)) throw new Error('Invalid completion');
        record.status = status;
        write(data);
        // An executor failure may leave partial effects or child processes alive.
        // Only proven completion automatically releases the deployment gate.
        if (status === 'completed') fs.unlinkSync(lockPath);
        finished = true;
      }
    };
  }

  return { reserve };
}

module.exports = { createDeliveryStore };
