const { Events } = require('discord.js');
const { handleLevelRoles } = require('../utils/levelRoles');
const { updateTopRoles } = require('../commands/toproles');
const { readConfig } = require('../utils/configCache');
const { readLevels, writeLevels, ensureUserData } = require('../utils/levelStore');

function xpToNext(level) { return 100 * Math.pow(level + 1, 2); }

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

      const base = Math.floor(Math.random() * 3) + 2;

      const cfg = readConfig();
      const bonuses = cfg.roleXpBonuses || {};
      const member = await message.guild.members.fetch(user.id).catch(() => null);

      let totalBonusPercent = 0;
      if (member?.roles?.cache?.size) {
        for (const [roleId] of member.roles.cache) {
          const b = bonuses[roleId];
          if (b !== undefined && b !== null) {
            const n = Number(b);
            if (!isNaN(n) && n > 0) totalBonusPercent += n;
          }
        }
      }

      const multiplier = 1 + (totalBonusPercent / 100);
      const gained = Math.round(base * multiplier);

      const levels = readLevels();
      const gid = message.guildId;
      const uid = user.id;
      const data = ensureUserData(levels, gid, uid);

      const oldLevel = data.level;
      data.xp += gained;

      let leveledUp = false;
      while (data.xp >= xpToNext(data.level)) {
        data.level++;
        leveledUp = true;
      }

      await writeLevels(levels);
      reactionCooldowns.set(key, now);

      console.log(`[levels DEBUG] ${user.username} +${gained} XP (reaction, base ${base}${totalBonusPercent ? ` +${totalBonusPercent}%` : ''})`);

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
            '🎉 {mention} alcanzó el nivel **{level}** y desbloqueó el rol {role}!';
          text = formatTemplate(rewardMsg, ctx);
        } else {
          text = formatTemplate(lu.message, ctx);
        }

        try {
          await target.send({ content: text });
        } catch (e) {
          console.error('[levels reaction] Error enviando anuncio de level up:', e?.message || e);
        }
      }

      if (leveledUp && typeof updateTopRoles === 'function') {
        try { await updateTopRoles(message.guild); } catch {}
      }
    } catch (err) {
      console.error('[REACTION] Error:', err);
    }
  });
};