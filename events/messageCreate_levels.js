const { Events } = require('discord.js');
const { updateTopRoles } = require('../commands/toproles');
const { handleLevelRoles } = require('../utils/levelRoles');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
const { readConfig } = require('../utils/configCache');
const { readLevels, writeLevels, ensureUserData } = require('../utils/levelStore');

function xpToNext(level) {
  return 100 * Math.pow(level + 1, 2);
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

const MSG_COOLDOWN = 10000;
const lastMsg = new Map();

const TOP_ROLES_COOLDOWN = 5 * 60 * 1000;
const lastTopRoleUpdate = new Map();

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const now = Date.now();
      const prev = lastMsg.get(message.author.id) || 0;
      if (now - prev < MSG_COOLDOWN) return;
      lastMsg.set(message.author.id, now);

      const guildId = message.guild.id;
      const userId = message.author.id;

      const levels = readLevels();
      const data = ensureUserData(levels, guildId, userId);

      const cfg = readConfig();
      
      const base = Math.floor(Math.random() * 6) + 3;

      const bonuses = cfg.roleXpBonuses || {};
      let totalBonusPercent = 0;
      
      const member = message.member;
      if (!member) {
        console.warn('[levels] No member found for', message.author.username);
      } else if (member.roles?.cache?.size) {
        for (const [roleId] of member.roles.cache) {
          const bonus = bonuses[roleId];
          if (bonus !== undefined && bonus !== null) {
            const bonusNum = Number(bonus);
            if (!isNaN(bonusNum) && bonusNum > 0) {
              totalBonusPercent += bonusNum;
            }
          }
        }
      }

      const multiplier = 1 + (totalBonusPercent / 100);
      const gained = Math.round(base * multiplier);

      const dailyXpLimit = cfg.dailyXpLimit || 0;
      if (dailyXpLimit > 0) {
        const today = Math.floor(Date.now() / 86400000);
        if (!data.dailyXp) data.dailyXp = { day: today, xp: 0 };
        if (data.dailyXp.day !== today) {
          data.dailyXp = { day: today, xp: 0 };
        }
        
        if (data.dailyXp.xp >= dailyXpLimit) {
          console.log(`[levels] ${message.author.username} alcanzó límite diario (${dailyXpLimit} XP)`);
          return;
        }
        
        const actualGained = Math.min(gained, dailyXpLimit - data.dailyXp.xp);
        data.dailyXp.xp += actualGained;
        data.xp = (data.xp || 0) + actualGained;
      } else {
        data.xp = (data.xp || 0) + gained;
      }

      const oldLevel = data.level || 0;
      data.messages = (data.messages || 0) + 1;

      let leveledUp = false;
      while (data.xp >= xpToNext(data.level)) {
        data.level += 1;
        leveledUp = true;
      }

      await writeLevels(levels);

      console.log(`[levels DEBUG] ${message.author.username} +${gained} XP (base ${base}${totalBonusPercent > 0 ? ` +${totalBonusPercent}% roles` : ''} = x${multiplier.toFixed(2)})`);

      if (leveledUp && typeof handleLevelRoles === 'function') {
        try { 
          await handleLevelRoles(message.member, data.level);
        } catch {}
      }

      if (leveledUp) {
        const lu = resolveLevelUpCfg(cfg);
        let target = null;
        
        if (lu.channelId) {
          target = await message.guild.channels.fetch(lu.channelId).catch(() => null);
        }

        if (target) {
          const levelRewards = cfg.levelRewards || {};
          const rewardRoleId = levelRewards[data.level];
          let rewardRole = null;
          
          if (rewardRoleId) {
            rewardRole = await message.guild.roles.fetch(rewardRoleId).catch(() => null);
          }

          const ctx = {
            mention: lu.mention ? `<@${userId}>` : message.author.username,
            username: message.author.username,
            tag: message.author.tag,
            level: data.level,
            oldLevel,
            xp: data.xp,
            guild: message.guild.name,
            role: rewardRole ? `<@&${rewardRole.id}>` : ''
          };

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
          } catch (e) {
            console.error('[levels] Error enviando anuncio de level up:', e?.message || e);
          }
        } else {
          console.warn('[levels] Canal de level-up no encontrado:', lu.channelId);
        }
      }

      if (typeof updateTopRoles === 'function') {
        const lastUpdate = lastTopRoleUpdate.get(guildId) || 0;
        if (now - lastUpdate >= TOP_ROLES_COOLDOWN) {
          lastTopRoleUpdate.set(guildId, now);
          try { 
            await updateTopRoles(message.guild);
          } catch (e) {
            console.error('[levels] Error actualizando top roles:', e?.message);
          }
        }
      }

      const profiles = readProfiles();
      const up = ensureUser(profiles, guildId, userId);
      const tzOffset = (cfg.timezone || 0) * 3600000;
      const today = Math.floor((Date.now() + tzOffset) / 86400000);
      
      if (up.lastActiveDay !== today) {
        const wasStreak = up.streakDays || 0;
        const isConsecutive = up.lastActiveDay === today - 1;
        
        up.streakDays = isConsecutive ? (up.streakDays + 1) : 1;
        up.lastActiveDay = today;
        
        if (!isConsecutive && wasStreak >= 7 && cfg.notifyStreakLost) {
          try {
            await message.author.send(
              `💔 Tu racha de **${wasStreak} días** se ha perdido. ¡Comienza una nueva hoy!`
            );
          } catch {}
        }
        
        writeProfiles(profiles);
      }
    } catch (err) {
      console.error('levels messageCreate error:', err);
    }
  });
};