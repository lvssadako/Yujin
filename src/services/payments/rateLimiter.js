// Limitador por ventana fija con TTL, limpieza explícita y reinicio controlado (regla 4).
function createRateLimiter({ limit, windowMs, now = Date.now }) {
  const hits = new Map();
  function sweep() {
    const t = now();
    for (const [key, entry] of hits) if (entry.resetAt <= t) hits.delete(key);
  }
  const timer = setInterval(sweep, Math.max(windowMs, 1000));
  timer.unref?.();
  return {
    allow(key) {
      const t = now();
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= t) {
        if (hits.size >= 10000) sweep();
        if (hits.size >= 10000) return false;
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      entry.count += 1;
      return entry.count <= limit;
    },
    sweep,
    reset() { hits.clear(); },
    size() { return hits.size; },
    stop() { clearInterval(timer); hits.clear(); }
  };
}

module.exports = { createRateLimiter };
