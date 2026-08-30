const { Events } = require('discord.js');
const logger = require('../utils/logger');
const { updateTopRoles } = require('../commands/utility/toproles');
const { handleLevelRoles } = require('../utils/levelRoles');
const { readConfig } = require('../utils/configCache');
const { readLevels, writeLevels, ensureUserData } = require('../services/level').levelService;

function xpToNext(level) { return 100 * Math.pow(level + 1, 2); }

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

async function awardVoice(guild, userId, member, channelId, sinceMs) {
  const now = Date.now();
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
  while (data.xp >= xpToNext(data.level)) { data.level += 1; leveledUp = true; }

  await writeLevels(levels);

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

function startTimer(guild, userId) {
  const key = makeKey(guild.id, userId);
  const s = sessions.get(key);
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);

  s.timer = setTimeout(async function tick() {
    try {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || !member.voice?.channelId) {
        await awardVoice(guild, userId, member, s.channelId, s.lastAwardAt);
        sessions.delete(key);
        return;
      }
      await awardVoice(guild, userId, member, s.channelId, s.lastAwardAt);
      s.lastAwardAt = Date.now();
      startTimer(guild, userId);
    } catch (e) {
      logger.error('[levels voice] tick error:', { error: e?.message || e });
      s.lastAwardAt = Date.now();
      startTimer(guild, userId);
    }
  }, TICK_MS);
}

module.exports = (client) => {
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const guild = newState.guild || oldState.guild;
      const userId = newState.id;
      const was = oldState.channelId;
      const now = newState.channelId;
      if (was === now) return;

      if (was) {
        const key = makeKey(guild.id, userId);
        const s = sessions.get(key);
        if (s) {
          const member = await guild.members.fetch(userId).catch(() => null);
          await awardVoice(guild, userId, member, s.channelId, s.lastAwardAt);
          if (!now) {
            if (s.timer) clearTimeout(s.timer);
            sessions.delete(key);
          } else {
            s.channelId = now;
            s.lastAwardAt = Date.now();
            startTimer(guild, userId);
          }
        }
      }
      if (!was && now) {
        const key = makeKey(guild.id, userId);
        sessions.set(key, { channelId: now, joinedAt: Date.now(), lastAwardAt: Date.now(), timer: null });
        startTimer(guild, userId);
      }
    } catch (err) {
      logger.error('[levels voice] voiceStateUpdate error:', { error: err.message, stack: err.stack });
    }
  });
};