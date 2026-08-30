const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'role_time.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readStore() {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { guilds: {} }; }
}
function writeStore(obj){ fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8'); }

function ensureTimer(gid, uid, rid) {
  const store = readStore();
  store.guilds[gid] = store.guilds[gid] || {};
  store.guilds[gid][uid] = store.guilds[gid][uid] || {};
  store.guilds[gid][uid][rid] = store.guilds[gid][uid][rid] || { startAt: 0, lastTick: 0 };
  writeStore(store);
  return store.guilds[gid][uid][rid];
}

function setStart(gid, uid, rid, whenMs) {
  const store = readStore();
  store.guilds[gid] = store.guilds[gid] || {};
  store.guilds[gid][uid] = store.guilds[gid][uid] || {};
  store.guilds[gid][uid][rid] = { startAt: whenMs, lastTick: whenMs };
  writeStore(store);
}

function popElapsedMinutes(gid, uid, rid, nowMs) {
  const store = readStore();
  const t = store.guilds[gid]?.[uid]?.[rid];
  if (!t || !t.startAt) return 0;
  const last = t.lastTick || t.startAt;
  const mins = Math.max(0, Math.floor((nowMs - last) / 60000));
  // avanza el lastTick
  t.lastTick = nowMs;
  writeStore(store);
  return mins;
}

function clearTimer(gid, uid, rid) {
  const store = readStore();
  if (store.guilds[gid]?.[uid]?.[rid]) {
    delete store.guilds[gid][uid][rid];
    writeStore(store);
  }
}

module.exports = { ensureTimer, setStart, popElapsedMinutes, clearTimer };