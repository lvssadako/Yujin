const eventLocks = new Map();

function makeRewardKey(guildId, userId, type, source = 'unknown') {
  return `${String(guildId)}:${String(userId)}:${String(type)}:${String(source)}`;
}

function grantOnce(guildId, userId, type, source, ttlMs = 60_000, fn) {
  const key = makeRewardKey(guildId, userId, type, source);
  const now = Date.now();
  const last = eventLocks.get(key) || 0;

  if (now - last < ttlMs) {
    return false;
  }

  eventLocks.set(key, now);
  try {
    const result = fn();
    return result;
  } catch (error) {
    eventLocks.delete(key);
    throw error;
  }
}

function grantOnceAsync(guildId, userId, type, source, ttlMs = 60_000, fn) {
  const key = makeRewardKey(guildId, userId, type, source);
  const now = Date.now();
  const last = eventLocks.get(key) || 0;

  if (now - last < ttlMs) {
    return false;
  }

  eventLocks.set(key, now);
  return Promise.resolve(fn()).catch((error) => {
    eventLocks.delete(key);
    throw error;
  });
}

function clearEventGuard(guildId, userId, type, source) {
  const key = makeRewardKey(guildId, userId, type, source);
  eventLocks.delete(key);
}

module.exports = {
  makeRewardKey,
  grantOnce,
  grantOnceAsync,
  clearEventGuard
};
