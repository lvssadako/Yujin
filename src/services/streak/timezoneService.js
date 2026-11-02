const DEFAULT_TIMEZONE = 'America/Mexico_City';
const DAY_MS = 86400000;

function normalizeTimezone(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 100) throw new Error('Zona horaria inválida.');
  try { return new Intl.DateTimeFormat('en-US', { timeZone: input.trim() }).resolvedOptions().timeZone; }
  catch { throw new Error('Zona horaria inválida. Elige una ciudad de la lista, por ejemplo America/Mexico_City.'); }
}

function localDay(timeZone, timestamp = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA-u-ca-iso8601', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date(timestamp)).map(p => [p.type, p.value]));
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY_MS);
}

function dayInfo(timeZone, timestamp = Date.now()) {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Invalid calendar timestamp');
  timeZone = normalizeTimezone(timeZone);
  const formatter = new Intl.DateTimeFormat('en-CA-u-ca-iso8601', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayAt = instant => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY_MS);
  };
  const today = dayAt(timestamp);
  // Find the actual next local midnight: DST days can last 23 or 25 hours.
  let low = timestamp, high = timestamp + 36 * 3600000;
  if (dayAt(high) <= today) throw new Error('Unable to resolve next local midnight');
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (dayAt(middle) > today) high = middle; else low = middle;
  }
  return { today, timeZone, midnightMs: high, midnightTs: Math.floor(high / 1000), msRemaining: high - timestamp };
}

function userTimezone(profiles, userId, cfg = {}) {
  const selected = profiles.globalUsers?.[userId]?.streakTimezone;
  return normalizeTimezone(selected || cfg.streakDefaultTimezone || DEFAULT_TIMEZONE);
}

function prepareCalendar(user, timeZone, cfg = {}, timestamp = Date.now()) {
  const info = dayInfo(timeZone, timestamp);
  let changed = false;
  if (user.streakCalendarVersion !== 2) {
    const last = Number(user.lastActiveDay) || 0;
    if (last > 0) {
      const legacyOffset = Number.isFinite(Number(cfg.timezone)) ? Number(cfg.timezone) : 0;
      // Legacy records lack a message timestamp. Use the last possible instant of
      // their recorded day, capped at now: a bounded grace preserves existing streaks.
      const latestPossible = Math.min(timestamp, (last + 1) * DAY_MS - legacyOffset * 3600000 - 1);
      user.lastActiveDay = dayInfo(timeZone, latestPossible).today;
    }
    user.streakCalendarVersion = 2;
    user.streakCalendarZone = info.timeZone;
    if (user.lastActiveDay === info.today) user.streakNextIncrementAt = info.midnightMs;
    changed = true;
  } else if (user.streakCalendarZone !== info.timeZone) {
    const previous = dayInfo(user.streakCalendarZone, timestamp);
    const gap = Math.max(0, previous.today - (Number(user.lastActiveDay) || 0));
    if (user.lastActiveDay > 0) user.lastActiveDay = info.today - gap;
    if (gap === 0) user.streakNextIncrementAt = Math.max(user.streakNextIncrementAt || previous.midnightMs, info.midnightMs);
    user.streakCalendarZone = info.timeZone;
    changed = true;
  }
  return { ...info, changed };
}
module.exports = { DEFAULT_TIMEZONE, DAY_MS, normalizeTimezone, localDay, dayInfo, userTimezone, prepareCalendar };
