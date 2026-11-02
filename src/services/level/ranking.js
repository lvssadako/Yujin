'use strict';

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function voiceMilliseconds(record) {
  if (record.voiceMs != null) return nonNegative(record.voiceMs);
  if (record.voiceTime != null) return nonNegative(record.voiceTime) * 1000;
  return nonNegative(record.voiceMinutes) * 60000;
}

function guildRecords(levels, guildId) {
  const legacy = levels[guildId] || {};
  const current = levels.guilds?.[guildId] || {};
  return Object.fromEntries([...new Set([...Object.keys(legacy), ...Object.keys(current)])]
    .map(id => [id, { ...legacy[id], ...current[id] }]));
}

function buildLeaderboard(levels, guildId, timeframe, category, limit, guild, day, week) {
  const entries = Object.entries(guildRecords(levels, guildId))
    .filter(([id]) => {
      const member = guild?.members?.cache?.get(id);
      const user = member?.user || guild?.client?.users?.cache?.get(id);
      return !user?.bot;
    })
    .map(([id, raw]) => {
      const d = { ...raw };
      for (const k of ['level', 'xp', 'messages', 'textXp', 'voiceXp']) d[k] = nonNegative(d[k]);
      d.voiceMs = voiceMilliseconds(d);
      const period = rawPeriod => {
        const r = { ...rawPeriod };
        for (const k of ['xp', 'messages', 'textXp', 'voiceXp']) r[k] = nonNegative(r[k]);
        r.voiceMs = voiceMilliseconds(r);
        return r;
      };
      const daily = period(d.daily?.day === day ? d.daily : {});
      const weekly = period(d.weekly?.week === week ? d.weekly : {});
      const selected = timeframe === 'daily' ? daily : timeframe === 'weekly' ? weekly : d;
      let score, detail;
      if (category === 'text') {
        score = selected.messages;
        detail = score.toLocaleString() + ' msgs';
      } else if (category === 'voice') {
        score = selected.voiceMs;
        detail = Math.floor(score / 60000).toLocaleString() + ' min en voz';
      } else {
        score = selected.xp;
        detail = timeframe === 'global'
          ? 'Nivel ' + d.level + ' • ' + d.xp.toLocaleString() + ' XP para el siguiente nivel'
          : score.toLocaleString() + ' XP ' + (timeframe === 'daily' ? 'hoy' : 'esta semana');
      }
      return { id, level: d.level, xp: d.xp, score, detail, timeframe, category,
        messages: d.messages, voiceMs: d.voiceMs, textXp: d.textXp, voiceXp: d.voiceXp, daily, weekly };
    });
  return entries
    .filter(e => e.score > 0 || timeframe === 'global')
    .sort((a, b) => {
      const delta = timeframe === 'global' && category === 'general'
        ? b.level - a.level || b.xp - a.xp : b.score - a.score;
      return delta || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

// Resolve membership before truncating: departed members and uncached bots
// must not occupy slots. Transient errors must not silently alter the top.
async function selectCurrentMembers(entries, guild, limit) {
  const selected = [];
  for (const entry of entries) {
    let member = guild.members.cache.get(entry.id);
    if (!member) {
      try { member = await guild.members.fetch(entry.id); }
      catch (error) {
        if ([10007, 10013].includes(Number(error.code))) continue;
        throw error;
      }
    }
    if (!member || member.user?.bot) continue;
    selected.push(entry);
    if (selected.length >= limit) break;
  }
  return selected;
}

module.exports = { buildLeaderboard, guildRecords, voiceMilliseconds, selectCurrentMembers };
