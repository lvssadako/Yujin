const path = require('node:path');
const fs = require('node:fs');
const { readJsonSafe, writeJsonAtomic } = require('../../utils/jsonStore');
const { withLock } = require('../economy/economyLock');

const ID_RE = /^\d{5,25}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const keyOf = (g, u, r) => `${g}:${u}:${r}`;

/**
 * Roles comprados con duración limitada. El vencimiento se guarda en disco ANTES de entregar el rol,
 * así un reinicio nunca deja un rol temporal permanente.
 */
function createRoleLeaseStore(options = {}) {
  const dir = options.dir || path.join(__dirname, '..', '..', '..', 'data', 'shop');
  const filePath = path.join(dir, 'role-leases.json');
  const now = options.now || Date.now;

  const load = () => {
    const parsed = readJsonSafe(filePath, null);
    if (!parsed) return { version: 1, leases: {} };
    if (parsed.version !== 1 || typeof parsed.leases !== 'object') throw new Error('Invalid role lease store');
    return parsed;
  };
  const transact = mutator => {
    fs.mkdirSync(dir, { recursive: true });
    return withLock(dir, () => { const state = load(); const result = mutator(state); writeJsonAtomic(filePath, state); return result; });
  };
  const check = (g, u, r) => { if (![g, u, r].every(v => ID_RE.test(String(v)))) throw new Error('Invalid lease identity'); };

  /** Crea o extiende (si ya está activo) el arrendamiento. days <= 0 no crea registro (rol permanente). */
  function grant({ guildId, userId, roleId, days }) {
    check(guildId, userId, roleId);
    if (!Number.isFinite(days) || days <= 0) return { permanent: true, expiresAt: null };
    return transact(state => {
      const key = keyOf(guildId, userId, roleId);
      const current = state.leases[key];
      const base = current && current.expiresAt > now() ? current.expiresAt : now();
      const expiresAt = base + Math.floor(days) * DAY_MS;
      state.leases[key] = { guildId, userId, roleId, expiresAt, updatedAt: now() };
      return { permanent: false, expiresAt, previous: current?.expiresAt || null };
    });
  }

  /** Revierte una concesión si la entrega del rol falló. */
  function rollback({ guildId, userId, roleId, previous }) {
    return transact(state => {
      const key = keyOf(guildId, userId, roleId);
      if (previous) state.leases[key] = { ...(state.leases[key] || { guildId, userId, roleId }), expiresAt: previous };
      else delete state.leases[key];
    });
  }

  const get = (guildId, userId, roleId) => load().leases[keyOf(guildId, userId, roleId)] || null;
  const listExpired = () => Object.values(load().leases).filter(l => l.expiresAt <= now());
  const remove = ({ guildId, userId, roleId }) => transact(state => { delete state.leases[keyOf(guildId, userId, roleId)]; });
  const listForUser = (guildId, userId) => Object.values(load().leases).filter(l => l.guildId === guildId && l.userId === userId);

  return { filePath, grant, rollback, get, listExpired, remove, listForUser };
}

/** Retira los roles vencidos. Idempotente: si el miembro salió o el rol ya no está, solo limpia el registro. */
async function sweepExpiredLeases({ store, client, logger = { warn() {}, info() {} } }) {
  let removed = 0;
  for (const lease of store.listExpired()) {
    try {
      const guild = client.guilds.cache.get(lease.guildId);
      if (!guild) continue; // el bot no está en ese servidor ahora: se reintenta luego
      const member = await guild.members.fetch(lease.userId).catch(() => null);
      if (member?.roles.cache.has(lease.roleId)) await member.roles.remove(lease.roleId, 'Venció el rol comprado en la tienda');
      store.remove(lease);
      removed += 1;
    } catch (e) {
      logger.warn('[shop] No se pudo retirar un rol vencido', { roleId: lease.roleId, error: e?.message });
    }
  }
  return removed;
}

function startLeaseSweeper({ store, client, logger, intervalMs = SWEEP_INTERVAL_MS }) {
  const run = () => sweepExpiredLeases({ store, client, logger }).catch(e => logger?.warn?.('[shop] Barrido de roles', { error: e?.message }));
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

module.exports = { createRoleLeaseStore, sweepExpiredLeases, startLeaseSweeper, DAY_MS };
