const autoMessageLocks = new Map();

function shouldSendAutoMessage(scope, key, ttlMs = 5000) {
  const lockKey = `${scope}:${String(key)}`;
  const now = Date.now();
  const prev = autoMessageLocks.get(lockKey) || 0;

  if (now - prev < ttlMs) {
    return false;
  }

  autoMessageLocks.set(lockKey, now);
  return true;
}

function clearAutoMessage(scope, key) {
  autoMessageLocks.delete(`${scope}:${String(key)}`);
}

module.exports = {
  shouldSendAutoMessage,
  clearAutoMessage
};
