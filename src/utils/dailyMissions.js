const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const { readConfig } = require('./configCache');
const { secureRandom } = require('./cryptoRandom');

const dataDir = path.join(__dirname, '..', '..', 'data');
const filePath = path.join(dataDir, 'daily_missions.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readStore() {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return { guilds: {} }; }
}
function writeStore(obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
}

function todayKey(tz) {
  return Math.floor((Date.now() + tz * 3600000) / 86400000);
}
function nextMidnightTs(tz) {
  const now = new Date(Date.now() + tz * 3600000);
  const reset = new Date(now);
  reset.setHours(24, 0, 0, 0);
  return reset.getTime() - tz * 3600000;
}

// Pool de misiones
function baseTemplates(guild) {
  const cfg = readConfig();  
  const list = [
    // ⚪ Comunes (alta probabilidad, sin gemas)
    { id: 'd_msg_50', type: 'messages', target: 50, reward: { coins: 100 }, desc: 'Envía 50 mensajes', icon: '💬', weight: 10 },
    { id: 'd_msg_70', type: 'messages', target: 70, reward: { coins: 120 }, desc: 'Envía 70 mensajes', icon: '💬', weight: 10 },
    { id: 'd_voice_30', type: 'voice', target: 30, reward: { coins: 150 }, desc: 'Pasa 30 min en voz', icon: '🎤', weight: 10 },
    { id: 'd_react_10', type: 'reactions', target: 10, reward: { coins: 80 }, desc: 'Añade 10 reacciones', icon: '⭐', weight: 10 },
    
    // 🔵 Raras (media probabilidad)
    { id: 'd_msg_100', type: 'messages', target: 100, reward: { coins: 200, xp: 150 }, desc: 'Envía 100 mensajes', icon: '💬', weight: 5 },
    { id: 'd_voice_60', type: 'voice', target: 60, reward: { coins: 300, xp: 200 }, desc: 'Pasa 1 hora en voz', icon: '🎤', weight: 5 },
    { id: 'd_react_20', type: 'reactions', target: 20, reward: { coins: 160, xp: 100 }, desc: 'Añade 20 reacciones', icon: '⭐', weight: 5 },
    { id: 'd_xp_500', type: 'xp_gain', target: 500, reward: { coins: 300 }, desc: 'Gana 500 XP hoy', icon: '📈', weight: 5 },
    
    // 🟣 Épicas (baja probabilidad, 0 gema)
    { id: 'd_msg_200', type: 'messages', target: 200, reward: { coins: 600, xp: 300 }, desc: 'Envía 200 mensajes', icon: '💬', weight: 2 },
    { id: 'd_voice_120', type: 'voice', target: 120, reward: { coins: 700, xp: 400 }, desc: 'Pasa 2 horas en voz', icon: '🎤', weight: 2 },
    { id: 'd_xp_1000', type: 'xp_gain', target: 1000, reward: { coins: 500 }, desc: 'Gana 1000 XP hoy', icon: '📈', weight: 2 },
    { id: 'd_chest_1', type: 'chests_opened', target: 1, reward: { coins: 500, xp: 500 }, desc: 'Abre 1 cofre', icon: '🎁', weight: 2 },
    
    // 🟡 Legendarias (muy rara, 1 gema)
    { id: 'd_msg_500', type: 'messages', target: 500, reward: { coins: 1500, xp: 800, gems: 1 }, desc: 'Envía 500 mensajes', icon: '💬', weight: 0.5 },
    { id: 'd_voice_180', type: 'voice', target: 180, reward: { coins: 1200, xp: 600, gems: 1 }, desc: 'Pasa 3 horas en voz', icon: '🎤', weight: 0.5 },
    { id: 'd_spend_1000', type: 'coins_spent', target: 2000, reward: { coins: 500, gems: 1 }, desc: 'Gasta 1000 monedas', icon: '💸', weight: 0.5 },
    { id: 'd_chest_10', type: 'chests_opened', target: 10, reward: { coins: 1000, gems: 1 }, desc: 'Abre 10 cofres', icon: '🎁', weight: 0.3 },
  ];
  
  // Misión de rol (peso medio)
  const statusRoleId = cfg.statusRoleId || cfg.status?.roleId;
  if (statusRoleId && guild?.roles?.cache?.has?.(statusRoleId)) {
    list.push({
      id: 'd_role_180',
      type: 'role_time',
      roleId: statusRoleId,
      target: 180,
      reward: { coins: 250, xp: 150, gems: 1 },
      desc: 'Coloca el link del server en tu estado por 3 horas',
      icon: '🛡️',
      weight: 3
    });
  }
  
  return list;
}

function genDaily(guild, userId, tz) {
  const store = readStore();
  const gid = guild.id;
  store.guilds[gid] = store.guilds[gid] || {};
  
  const pool = [...baseTemplates(guild)];
  const chosen = [];
  
  // ✅ Selección ponderada segura (3 misiones)
  for (let i = 0; i < 3 && pool.length; i++) {
    const totalW = pool.reduce((s, m) => s + (m.weight || 1), 0);
    let r = secureRandom() * totalW;
    for (let j = 0; j < pool.length; j++) {
      r -= (pool[j].weight || 1);
      if (r <= 0) {
        const picked = pool.splice(j, 1)[0];
        chosen.push({ ...picked, progress: 0, completed: false, claimed: false });
        break;
      }
    }
  }

  store.guilds[gid][userId] = {
    list: chosen,
    day: todayKey(tz),
    nextResetAt: nextMidnightTs(tz)
  };
  writeStore(store);
  return chosen;
}

function getDaily(guild, userId, tz) {
  const store = readStore();
  const gid = guild.id;
  const entry = store.guilds[gid]?.[userId];
  const day = todayKey(tz);
  if (!entry || entry.day !== day) return genDaily(guild, userId, tz);
  return entry.list;
}

function timeToResetMs(guild, userId, tz) {
  const store = readStore();
  const gid = guild.id;
  const entry = store.guilds[gid]?.[userId];
  const now = Date.now();
  let next = entry?.nextResetAt || nextMidnightTs(tz);
  if (now >= next) next = nextMidnightTs(tz);
  return Math.max(0, next - now);
}

function updateMissionProgress(guild, userId, type, amount = 1) {
  const cfg = readConfig();
  const tz = cfg.timezone || 0;
  const list = getDaily(guild, userId, tz);

  const store = readStore();
  const gid = guild.id;
  const entry = store.guilds[gid]?.[userId];
  if (!entry) return;

  let changed = false;
  for (const m of entry.list) {
    if (m.type !== type || m.completed) continue;
    m.progress = Math.min(m.target, (m.progress || 0) + amount);
    if (m.progress >= m.target) {
      m.completed = true;
      changed = true;
    } else {
      changed = true;
    }
  }
  
  if (changed) {
    writeStore(store);
    logger.info(`[Missions] ${userId} → ${type} +${amount} (actualizado)`);
  }
}

function claimDaily(guild, userId, missionId) {
  const store = readStore();
  const gid = guild.id;
  const entry = store.guilds[gid]?.[userId];
  if (!entry) return null;
  const m = entry.list.find(x => x.id === missionId);
  if (!m || !m.completed || m.claimed) return null;
  m.claimed = true;
  writeStore(store);
  return m.reward;
}

module.exports = {
  getDaily,
  genDaily,
  updateMissionProgress,
  claimDaily,
  timeToResetMs
};