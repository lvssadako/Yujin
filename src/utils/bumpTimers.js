const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');
const timersPath = path.join(__dirname, '..', '..', 'data', 'bump_timers.json');

function readTimers() {
  const data = readJsonSafe(timersPath, []);
  return Array.isArray(data) ? data : [];
}

function writeTimers(timers) {
  writeJsonAtomic(timersPath, Array.isArray(timers) ? timers : []);
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
