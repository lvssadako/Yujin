const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { updateTopRoles } = require('../commands/utility/toproles');
const { handleLevelRoles } = require('../utils/levelRoles');
const { updateMissionProgress } = require('../utils/dailyMissions');
const { readConfig } = require('../utils/configCache');
const { readLevels, writeLevels, ensureUserData, xpToNext } = require('../services/level').levelService;


function getRoleBonusPercent(cfg, member) {
  const bonuses = cfg.roleXpBonuses || {};
  if (!member?.roles?.cache?.size) return 0;
  let total = 0;
  for (const [roleId] of member.roles.cache) {
    const v = bonuses[roleId];
    if (v !== undefined && v !== null) {
      const n = Number(v);
      if (!isNaN(n) && n > 0) total += n;
    }
  }
  return total;
}

function resolveLevelUpCfg(cfg) {
  const group = cfg.levelUp || cfg.levels || {};
  return {
    channelId: cfg.levelUpChannelId || group.levelUpChannelId || group.channelId,
    message:
      cfg.levelUpMessage || group.levelUpMessage || group.message ||
      '<a:LcoSaboreandoMiNitro:1396293651319095408> {mention} subió a nivel {level}!',
    useEmbed:
      typeof cfg.levelUpUseEmbed === 'boolean' ? cfg.levelUpUseEmbed
      : typeof group.levelUpUseEmbed === 'boolean' ? group.levelUpUseEmbed
      : false,
    mention:
      typeof cfg.levelUpMention === 'boolean' ? cfg.levelUpMention
      : typeof group.levelUpMention === 'boolean' ? group.levelUpMention
      : true
  };
}

function formatTemplate(tpl, ctx) {
  return String(tpl)
    .replace(/\{mention\}/g, ctx.mention)
    .replace(/\{user\}/g, ctx.username)
    .replace(/\{tag\}/g, ctx.tag)
    .replace(/\{level\}/g, String(ctx.level))
    .replace(/\{oldLevel\}/g, String(ctx.oldLevel))
    .replace(/\{xp\}/g, String(ctx.xp))
    .replace(/\{guild\}/g, ctx.guild)
    .replace(/\{role\}/g, ctx.role || '');
}

const sessions = new Map();
const TICK_MS = 60_000;
const makeKey = (gid, uid) => `${gid}:${uid}`;

async function awardVoice(guild, userId, member, channelId, sinceMs, untilMs = Date.now()) {
  if (member?.user?.bot) return;
  const now = untilMs;
  const elapsedSec = Math.max(0, Math.floor((now - sinceMs) / 1000));
  if (elapsedSec <= 0) return;

  const levels = readLevels();
  const data = ensureUserData(levels, guild.id, userId);

  const cfg = readConfig();
  const chanMult = (cfg.channels && Number(cfg.channels[channelId])) || 1;
  const roleBonusPercent = getRoleBonusPercent(cfg, member);
  const roleMult = 1 + (roleBonusPercent / 100);
  
  // Balanceado: 20 XP base por minuto en canal de voz activo (equivalente a chat activo)
  const basePerMin = Number(cfg.voiceXpPerMinute) || 20;

  // Modificadores de actividad y anti-AFK
  let activityMult = 1.0;
  if (member?.voice) {
    if (member.voice.selfDeaf || member.voice.serverDeaf) {
      activityMult = 0.2; // Sordeado recibe sólo 20%
    } else if (member.voice.selfMute || member.voice.serverMute) {
      activityMult = 0.8; // Muteado pero escuchando recibe 80%
    }

    const channel = member.voice.channel;
    if (channel && channel.members.filter(m => !m.user.bot).size <= 1) {
      activityMult *= 0.5; // Solo en sala recibe 50%
    }
  }

  const gained = Math.max(0, Math.round(basePerMin * (elapsedSec / 60) * chanMult * roleMult * activityMult));
  const elapsedMs = elapsedSec * 1000;

  const oldLevel = data.level;
  data.voiceTime = (data.voiceTime || 0) + elapsedSec;
  data.voiceMs = (data.voiceMs || 0) + elapsedMs;
  data.daily.voiceMs = (data.daily.voiceMs || 0) + elapsedMs;
  data.weekly.voiceMs = (data.weekly.voiceMs || 0) + elapsedMs;

  if (gained > 0) {
    data.xp = (data.xp || 0) + gained;
    data.voiceXp = (data.voiceXp || 0) + gained;
    data.daily.xp = (data.daily.xp || 0) + gained;
    data.daily.voiceXp = (data.daily.voiceXp || 0) + gained;
    data.weekly.xp = (data.weekly.xp || 0) + gained;
    data.weekly.voiceXp = (data.weekly.voiceXp || 0) + gained;
  }

  let leveledUp = false;
  while (data.xp >= xpToNext(data.level)) {
    data.xp -= xpToNext(data.level);
    data.level += 1;
    leveledUp = true;
  }

  writeLevels(levels);
  // Mission errors must not replay an interval whose XP/time is already persisted.
  try {
    updateMissionProgress(guild, userId, 'voice', elapsedSec / 60);
    if (gained) updateMissionProgress(guild, userId, 'xp_gain', gained);
  } catch (error) { logger.error('[levels voice] mission progress error', { error: error.message }); }

  const bonusText = roleBonusPercent ? ` +${roleBonusPercent}%` : '';
  const chanText = chanMult !== 1 ? `, canal x${chanMult}` : '';
  logger.debug('[levels voice] Awarded voice XP', {
    user: member?.user?.username || userId,
    gained,
    elapsedSec: Math.floor(elapsedSec),
    bonusText,
    chanText
  });

  if (leveledUp) {
    if (typeof handleLevelRoles === 'function') {
      try {
        await handleLevelRoles(member, data.level);
      } catch {}
    }
    
    const lu = resolveLevelUpCfg(cfg);
    let target = null;
    if (lu.channelId) target = await guild.channels.fetch(lu.channelId).catch(() => null);
    
    if (target) {
      // Verificar si hay recompensa de rol para este nivel
      const levelRewards = cfg.levelRewards || {};
      const rewardRoleId = levelRewards[data.level];
      let rewardRole = null;
      
      if (rewardRoleId) {
        rewardRole = await guild.roles.fetch(rewardRoleId).catch(() => null);
      }

      const ctx = {
        mention: lu.mention ? `<@${userId}>` : (member?.user?.username || userId),
        username: member?.user?.username || userId,
        tag: member?.user?.tag || userId,
        level: data.level,
        oldLevel,
        xp: data.xp,
        guild: guild.name,
        role: rewardRole ? `<@&${rewardRole.id}>` : ''
      };

      // Mensaje especial si hay recompensa de rol
      let text;
      if (rewardRole) {
        const rewardMsg = cfg.levelRewardMessage || 
          '🎉 {mention} alcanzó el nivel **{level}** y desbloqueó el rol {role}!';
        text = formatTemplate(rewardMsg, ctx);
      } else {
        text = formatTemplate(lu.message, ctx);
      }

      try {
        await target.send({ content: text });
      } catch {}
    }
    
    if (typeof updateTopRoles === 'function') { 
      try { await updateTopRoles(guild); } catch {} 
    }
  }
}

let stopping = false;

function flushSession(s, until, member = s.member, channelId = s.channelId) {
  s.queue = s.queue.catch(() => {}).then(async () => {
    const since = s.lastAwardAt;
    const seconds = Math.max(0, Math.floor((until - since) / 1000));
    if (!seconds) return;
    await awardVoice(s.guild, s.userId, member, channelId, since, until);
    s.lastAwardAt = since + seconds * 1000;
  });
  return s.queue;
}

function startTimer(guild, userId) {
  const key = makeKey(guild.id, userId), s = sessions.get(key);
  if (!s || stopping) return;
  if (s.timer) clearTimeout(s.timer);
  s.timer = setTimeout(async () => {
    if (stopping || sessions.get(key) !== s) return;
    try {
      const cutoff = Date.now();
      const member = guild.members.cache.get(userId) || s.member;
      if (member) s.member = member;
      const left = member?.voice && !member.voice.channelId;
      if (left) { sessions.delete(key); s.timer = null; }
      await flushSession(s, cutoff, member);
    } catch (error) {
      logger.error('[levels voice] tick error', { error: error.message });
    } finally {
      if (sessions.get(key) === s) startTimer(guild, userId);
    }
  }, TICK_MS);
  s.timer?.unref?.();
}

function startSession(guild, userId, channelId, member, now = Date.now()) {
  if (stopping || member?.user?.bot) return;
  const key = makeKey(guild.id, userId);
  if (sessions.has(key)) return;
  sessions.set(key, { guild, userId, channelId, member, lastAwardAt: now, timer: null, queue: Promise.resolve() });
  startTimer(guild, userId);
}

async function stopVoiceSessions() {
  stopping = true;
  const cutoff = Date.now();
  const pending = [...sessions.values()].map(s => {
    if (s.timer) clearTimeout(s.timer);
    return flushSession(s, cutoff).catch(error => logger.error('[levels voice] shutdown flush error', { error: error.message }));
  });
  sessions.clear();
  await Promise.all(pending);
}

module.exports = client => {
  stopping = false;
  client.on(Events.ClientReady, () => {
    // Only time since this process became ready is counted; downtime is not invented.
    for (const guild of client.guilds.cache.values()) {
      for (const state of guild.voiceStates.cache.values()) {
        if (state.channelId) startSession(guild, state.id, state.channelId, state.member || guild.members.cache.get(state.id));
      }
    }
  });
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    if (stopping) return;
    try {
      const guild = newState.guild || oldState.guild, userId = newState.id;
      const member = newState.member || oldState.member || guild.members.cache.get(userId);
      if (member?.user?.bot) return;
      const key = makeKey(guild.id, userId), s = sessions.get(key);
      const cutoff = Date.now(), current = newState.channelId;
      if (oldState.channelId === current) {
        if (current && !s) startSession(guild, userId, current, member, cutoff);
        if (s && member) s.member = member;
        return;
      }
      if (s) {
        const previousChannel = s.channelId;
        const pending = flushSession(s, cutoff, oldState.member || s.member || member, previousChannel);
        if (s.timer) clearTimeout(s.timer);
        if (!current) sessions.delete(key);
        else {
          s.channelId = current;
          s.member = member || s.member;
          startTimer(guild, userId);
        }
        await pending;
      } else if (current) {
        startSession(guild, userId, current, member, cutoff);
      }
    } catch (error) {
      logger.error('[levels voice] voiceStateUpdate error', { error: error.message, stack: error.stack });
    }
  });
};
module.exports.stopVoiceSessions = stopVoiceSessions;
