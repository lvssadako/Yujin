// Utilidad para manejar timers de bump persistentes
const fs = require('fs');
const path = require('path');
const timersPath = path.join(__dirname, '..', '..', 'data', 'bump_timers.json');

function readTimers() {
  try {
    return JSON.parse(fs.readFileSync(timersPath, 'utf8'));
  } catch {
    return [];
  }
}

function writeTimers(timers) {
  fs.writeFileSync(timersPath, JSON.stringify(timers, null, 2));
}

function addTimer(timer) {
  const timers = readTimers();
  const nextTimers = timers.filter(t => t.guildId !== timer.guildId);
  nextTimers.push(timer);
  writeTimers(nextTimers);
}

function removeTimer(timerId) {
  let timers = readTimers();
  timers = timers.filter(t => t.id !== timerId);
  writeTimers(timers);
}

function hasActiveTimerForGuild(guildId) {
  return readTimers().some(timer => timer.guildId === guildId);
}

module.exports = { readTimers, writeTimers, addTimer, removeTimer, hasActiveTimerForGuild };
