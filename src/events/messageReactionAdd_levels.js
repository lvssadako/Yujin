const logger = require('./utils/logger');
const { Events } = require('discord.js');
const { handleLevelRoles } = require('../utils/levelRoles');
const { updateTopRoles } = require('../commands/toproles');
const { readConfig } = require('../utils/configCache');
const { readLevels, writeLevels, ensureUserData } = require('../services/level').levelService;
const { updateMissionProgress } = require('../utils/dailyMissions');
const { addCoins } = require('../src/services/economy').economyService;

function xpToNext(level) { return Math.round(200 * Math.pow(level + 1, 1.4)); }

function resolveLevelUpCfg(cfg) {
  const group = cfg.levelUp || cfg.levels || {};
  return {
    channelId: cfg.levelUpChannelId || group.levelUpChannelId || group.channelId,
    message:
      cfg.levelUpMessage || group.levelUpMessage || group.message ||
      '<a:LcoEstrellitas:1113788343663214613> {mention} subió a nivel {level}!',
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

const reactionCooldowns = new Map();

module.exports = (client) => {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (user.bot) return;
      const message = reaction.message;
      if (!message.guild) return;

      const key = `${message.guildId}-${user.id}`;
      const now = Date.now();
      const last = reactionCooldowns.get(key) || 0;
      if (now - last < 60_000) return;

      const base = Math.floor(Math.random() * 6) + 5;

      const cfg = readConfig();
      const bonuses = cfg.roleXpBonuses || {};
      const member = await message.guild.members.fetch(user.id).catch(() => null);

      let totalBonusDecimal = 0; // ✅ Cambiar de totalBonusPercent
      
      if (member?.roles?.cache?.size) {
        for (const [roleId] of member.roles.cache) {
          if (!(roleId in bonuses)) continue;
          let b = Number(bonuses[roleId]);
          if (isNaN(b) || b <= 0) continue;
          // ✅ Convertir si es porcentaje
          if (b > 1) b = b / 100;
          totalBonusDecimal += b;
        }
      }

      const multiplier = 1 + totalBonusDecimal; // ✅ Ya no dividir por 100
      const gained = Math.round(base * multiplier);

      const levels = readLevels();
      const gid = message.guildId;
      const uid = user.id;
      const data = ensureUserData(levels, gid, uid);

      const oldLevel = data.level;
      data.xp += gained;

      updateMissionProgress(message.guild, user.id, 'reactions', 1);
      updateMissionProgress(message.guild, user.id, 'xp_gain', gained);

      let leveledUpCount = 0; // ✅ Cambiar a contador
      while (data.xp >= xpToNext(data.level)) {
        data.xp -= xpToNext(data.level);
        data.level++;
        leveledUpCount++;
      }
      const leveledUp = leveledUpCount > 0;

      // ✅ Premio de monedas por nivel
      if (leveledUpCount > 0) {
        addCoins(message.guildId, user.id, 1000 * leveledUpCount);
      }

      await writeLevels(levels);
      reactionCooldowns.set(key, now);

      const bonusPct = Math.round(totalBonusDecimal * 100); // ✅ Para el log
      logger.info(
        `[reaction] ${user.username} +${gained} XP ` +
        `(base ${base}${bonusPct > 0 ? ` +${bonusPct}% roles` : ''} = x${multiplier.toFixed(2)})`
      );

      if (leveledUp && typeof handleLevelRoles === 'function') {
        try {
          await handleLevelRoles(member, data.level);
        } catch {}
      }

      if (leveledUp) {
        const lu = resolveLevelUpCfg(cfg);
        let target = null;
        if (lu.channelId) {
          target = await message.guild.channels.fetch(lu.channelId).catch(() => null);
        }
        if (!target) target = message.channel;

        // Verificar si hay recompensa de rol para este nivel
        const levelRewards = cfg.levelRewards || {};
        const rewardRoleId = levelRewards[data.level];
        let rewardRole = null;
        if (rewardRoleId) {
          rewardRole = await message.guild.roles.fetch(rewardRoleId).catch(() => null);
          if (rewardRole && member) {
            try {
              await member.roles.add(rewardRole.id).catch(() => {});
              if (cfg.levelRewardsExclusive) {
                const allRewardIds = new Set(Object.values(levelRewards).filter(Boolean));
                for (const rid of allRewardIds) {
                  if (rid !== rewardRoleId && member.roles.cache.has(rid)) {
                    await member.roles.remove(rid).catch(() => {});
                  }
                }
              }
            } catch (e) {
              logger.warn('[levels reaction] No se pudo asignar rol de recompensa:', e?.message || e);
            }
          }
        }


        const ctx = {
          mention: lu.mention ? `<@${uid}>` : user.username,
          username: user.username,
          tag: user.tag,
          level: data.level,
          oldLevel,
          xp: data.xp,
          guild: message.guild.name,
          role: rewardRole ? `<@&${rewardRole.id}>` : ''
        };

        // Mensaje especial si hay recompensa de rol
        let text;
        if (rewardRole) {
          const rewardMsg = cfg.levelRewardMessage || 
            '<a:Lco:1244072847551238244> {mention} alcanzó el nivel **{level}** y desbloqueó el rol {role}!';
          text = formatTemplate(rewardMsg, ctx);
        } else {
          text = formatTemplate(lu.message, ctx);
        }

        try {
          await target.send({
            content: text,
            // ✅ Ping solo al usuario (uid), sin ping a roles
            allowedMentions: { users: [userId] }
          });
        } catch (e) {
          logger.error('[levels reaction] Error enviando anuncio de level up:', e?.message || e);
        }
      }

      if (leveledUp && typeof updateTopRoles === 'function') {
        try { await updateTopRoles(message.guild); } catch {}
      }
    } catch (err) {
      logger.error('[REACTION] Error:', err);
    }
  });
};