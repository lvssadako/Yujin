const fs = require('fs');
const path = require('path');

const MISSIONS_FILE = path.join(__dirname, '..', 'data', 'missions.json');

function readMissions() {
  if (!fs.existsSync(MISSIONS_FILE)) {
    fs.writeFileSync(MISSIONS_FILE, JSON.stringify({ guilds: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(MISSIONS_FILE, 'utf8'));
}

function writeMissions(data) {
  fs.writeFileSync(MISSIONS_FILE, JSON.stringify(data, null, 2));
}

function generateDailyMissions() {
  return [
    { id: 'msg50', desc: 'Envía 50 mensajes', reward: 100, progress: 0, goal: 50, type: 'messages' },
    { id: 'voice60', desc: 'Habla 60 minutos en voz', reward: 75, progress: 0, goal: 60, type: 'voice' },
    { id: 'gacha3', desc: 'Haz 3 tiradas en el gacha', reward: 50, progress: 0, goal: 3, type: 'gacha' }
  ];
}

function getUserMissions(guildId, userId) {
  const missions = readMissions();
  if (!missions.guilds[guildId]) missions.guilds[guildId] = {};
  if (!missions.guilds[guildId][userId]) {
    missions.guilds[guildId][userId] = {
      daily: generateDailyMissions(),
      lastReset: Date.now()
    };
    writeMissions(missions);
  }
  
  const user = missions.guilds[guildId][userId];
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  
  // Resetear misiones cada 24h
  if (now - user.lastReset >= DAY_MS) {
    user.daily = generateDailyMissions();
    user.lastReset = now;
    writeMissions(missions);
  }
  
  return user.daily;
}

function updateMissionProgress(guildId, userId, type, amount = 1) {
  const missions = readMissions();
  const user = missions.guilds?.[guildId]?.[userId];
  if (!user) return [];
  
  const completed = [];
  
  for (const mission of user.daily) {
    if (mission.type === type && mission.progress < mission.goal) {
      mission.progress = Math.min(mission.progress + amount, mission.goal);
      
      if (mission.progress >= mission.goal && !mission.claimed) {
        completed.push(mission);
      }
    }
  }
  
  writeMissions(missions);
  return completed;
}

function claimMission(guildId, userId, missionId) {
  const missions = readMissions();
  const user = missions.guilds?.[guildId]?.[userId];
  if (!user) return null;
  
  const mission = user.daily.find(m => m.id === missionId);
  if (!mission || mission.claimed || mission.progress < mission.goal) return null;
  
  mission.claimed = true;
  writeMissions(missions);
  
  return mission.reward;
}

module.exports = {
  getUserMissions,
  updateMissionProgress,
  claimMission
};