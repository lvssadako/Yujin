const logger = require('../utils/logger');
const { Events } = require('discord.js');
const { updateTopRoles } = require('../commands/utility/toproles');
const { handleLevelRoles } = require('../utils/levelRoles');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
const { readConfig } = require('../utils/configCache');
const { readLevels, writeLevels, ensureUserData, getXpMultiplier } = require('../services/level').levelService;
const { checkAndGrantBadges } = require('../utils/badgeManager');
const { addCoins } = require('../services/economy').economyService;
const { updateMissionProgress } = require('../utils/dailyMissions');
const { shouldSendAutoMessage } = require('../utils/autoMessageGuard');

function xpToNext(level) {
  return Math.round(200 * Math.pow(level + 1, 1.4));
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

// Anti-spam: filtros y cooldown SOLO para XP.
// Los mensajes SIEMPRE cuentan para perfil y misiones.
const MIN_LEN_FOR_XP = 3;
const XP_COOLDOWN_MS = 10000;
const REPEAT_WINDOW = 5;
const lastXpAward = new Map();      // userId -> timestamp último XP
const recentTexts = new Map();      // userId -> últimos contenidos para anti-repetición

// === CONFIG DE DROP INTERACTIVO ===
const DROP_TRIGGER = 50; // cada 50 mensajes del servidor
const DROP_AMOUNT_MIN = 200;
const DROP_AMOUNT_MAX = 800;
const DROP_EMOJI = '💰';
const dropState = {}; // guildId -> { count, lastDropMsgId, activeDrop }
// === FIN DROP CONFIG ===

function isAwardableContent(msg) {
  const content = (msg.content || '').trim();
  if (content.length < MIN_LEN_FOR_XP) return false;
  if (/^(https?:\/\/|www\.)/i.test(content)) return false; // enlaces
  if (/^[!?._-]+$/.test(content)) return false;            // solo símbolos
  if (content.split(/\s+/).length < 2 && content.length < 15) return false; // muy corto
  const arr = recentTexts.get(msg.author.id) || [];
  if (arr.includes(content)) return false; // repetido
  arr.push(content);
  if (arr.length > REPEAT_WINDOW) arr.shift();
  recentTexts.set(msg.author.id, arr);
  return true;
}

const TOP_ROLES_COOLDOWN = 5 * 60 * 1000;
const lastTopRoleUpdate = new Map();
const levelUpDedup = new Map(); // Deduplicador: userId -> timestamp

module.exports = (client) => {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild || message.author.bot) return;

      const guildId = message.guild.id;
      const userId = message.author.id;

      const levels = readLevels();
      const data = ensureUserData(levels, guildId, userId);

      const cfg = readConfig();

      // 1) Contar SIEMPRE el mensaje (perfil + misiones)
      data.messages = (data.messages || 0) + 1;
      updateMissionProgress(message.guild, userId, 'messages', 1);

      // 2) Filtros anti-spam/cooldown para XP
      const now = Date.now();
      const last = lastXpAward.get(userId) || 0;
      const passesCooldown = (now - last) >= XP_COOLDOWN_MS;
      const passesContent = isAwardableContent(message);

      let leveledUpCount = 0;

      if (passesCooldown && passesContent) {
        const base = Math.floor(Math.random() * 16) + 15; // 15-30 XP base

        // Bonus de roles
        const bonuses = cfg.roleXpBonuses || {};
        let totalBonusDecimal = 0;
        const member = message.member;
        if (member?.roles?.cache?.size) {
          for (const [roleId] of member.roles.cache) {
            if (!(roleId in bonuses)) continue;
            let b = Number(bonuses[roleId]);
            if (isNaN(b) || b <= 0) continue;
            if (b > 1) b = b / 100; // compat: porcentaje -> decimal
            totalBonusDecimal += b;
          }
        }

        // Boosts activos
        const boostMultiplier = getXpMultiplier(guildId, userId);
        const roleMultiplier = 1 + totalBonusDecimal;
        const totalMultiplier = roleMultiplier * boostMultiplier;
        let gained = Math.round(base * totalMultiplier);

        // Límite diario
        const dailyXpLimit = cfg.dailyXpLimit || 0;
        if (dailyXpLimit > 0) {
          const today = Math.floor(Date.now() / 86400000);
          if (!data.dailyXp) data.dailyXp = { day: today, xp: 0 };
          if (data.dailyXp.day !== today) data.dailyXp = { day: today, xp: 0 };

          if (data.dailyXp.xp >= dailyXpLimit) {
            gained = 0;
          } else {
            const allowed = Math.min(gained, dailyXpLimit - data.dailyXp.xp);
            data.dailyXp.xp += allowed;
            gained = allowed;
          }
        }

        if (gained > 0) {
          const oldLevel = data.level || 0;
          data.xp = (data.xp || 0) + gained;
          updateMissionProgress(message.guild, userId, 'xp_gain', gained);

          while (data.xp >= xpToNext(data.level)) {
            data.xp -= xpToNext(data.level);
            data.level += 1;
            leveledUpCount++;
          }

          // Monedas cuando hay XP
          const baseCoins = Math.floor(Math.random() * 3) + 1;
          const boosterRole = message.guild?.roles?.premiumSubscriberRole;
          const isBooster = member?.premiumSince || (boosterRole && member?.roles?.cache?.has(boosterRole.id));
          const coinsEarned = isBooster ? Math.floor(baseCoins * 1.5) : baseCoins;
          addCoins(guildId, userId, coinsEarned);
          if (leveledUpCount > 0) addCoins(guildId, userId, 100 * leveledUpCount);

          const bonusPct = Math.round(totalBonusDecimal * 100);
          logger.info(
            `[levels] ${message.author.tag} +${gained} XP (base ${base}` +
            `${bonusPct > 0 ? ` +${bonusPct}% roles` : ''}` +
            `${boostMultiplier > 1 ? ` ×${boostMultiplier.toFixed(2)} boost` : ''}` +
            ` = ×${totalMultiplier.toFixed(2)})`
          );

          // Badges cada 50 mensajes (independiente del XP, pero lo mantenemos aquí como estaba)
          if (data.messages % 50 === 0) {
            try {
              const newBadges = await checkAndGrantBadges(message.guild, userId);
              if (newBadges.length) {
                const badgeList = newBadges.map(b => `${b.icon || '🏅'} **${b.name}**`).join(', ');
                try { await message.author.send(`🎖️ Nuevo logro desbloqueado: ${badgeList}`); } catch {}
              }
            } catch (e) {
              logger.warn('[badges] Error verificando logros por mensajes:', e?.message);
            }
          }

          // Roles por nivel y anuncio (si sube)
          if (leveledUpCount > 0 && typeof handleLevelRoles === 'function') {
            try { await handleLevelRoles(member, data.level); } catch {}
          }

          if (leveledUpCount > 0) {
            // ✅ DEDUPLICADOR: evitar anuncios duplicados en caso de eventos duplicados
            const now = Date.now();
            const lastLevelUp = levelUpDedup.get(userId) || 0;
            const dedupeKey = `${guildId}:${userId}:levelup`;
            if (now - lastLevelUp < 3000 || !shouldSendAutoMessage('levelup', dedupeKey, 3000)) {
              if (now - lastLevelUp >= 3000) {
                levelUpDedup.set(userId, now);
              }
              logger.warn(`[levels] ⚠️ Level-up duplicado detectado para ${message.author.tag}, ignorando anuncio`);
              lastXpAward.set(userId, now);
              writeLevels(levels);
              return; // Salir sin enviar anuncio
            }
            levelUpDedup.set(userId, now);
            const lu = resolveLevelUpCfg(cfg);
            let target = null;
            let messageWasSent = false;

            // Intentar obtener el canal configurado
            if (lu.channelId && lu.channelId !== message.channel.id) {
              logger.info(`[levels] Intentando obtener canal: ${lu.channelId}`);
              target = await message.guild.channels.fetch(lu.channelId).catch((e) => {
                logger.warn(`[levels] ❌ No se pudo obtener canal ${lu.channelId}:`, e?.message);
                return null;
              });
            } else if (lu.channelId && lu.channelId === message.channel.id) {
              logger.info('[levels] El canal de level-up es el canal actual');
              target = message.channel;
            } else {
              logger.warn('[levels] ⚠️ No hay levelUpChannelId configurado en config');
            }

            // Si no hay canal, usar el canal del mensaje actual (SOLO si es diferente)
            if (!target) {
              target = message.channel;
              logger.info('[levels] Usando canal actual como fallback');
            }

            // SIEMPRE hacer asignación de roles si aplica
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
                  logger.warn('[levels] No se pudo asignar rol de recompensa:', e?.message || e);
                }
              }
            }

            // Construir contexto del mensaje
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
                '<a:Lco:1244072847551238244> {mention} alcanzó el nivel **{level}** y desbloqueó el rol {role}!';
              text = formatTemplate(rewardMsg, ctx);
            } else {
              text = formatTemplate(lu.message, ctx);
            }

            // Intentar enviar al canal
            try {
              logger.info(`[levels] Enviando anuncio a canal: ${target.name || target.id}`);
              await target.send({
                content: text,
                allowedMentions: { parse: [], users: [userId] }
              });
              messageWasSent = true;
              logger.info(`[levels] ✅ Mensaje de level-up enviado exitosamente`);
            } catch (e) {
              logger.error('[levels] ❌ Error enviando anuncio de level up:', e?.message || e);
              
              // Fallback: enviar por DM si falla el canal
              try {
                logger.info('[levels] Intentando enviar por DM como fallback');
                await message.author.send({
                  content: `📩 **${message.guild.name}** - Level Up\n${text}`,
                  allowedMentions: { users: [] }
                });
                messageWasSent = true;
                logger.info('[levels] ✅ Mensaje enviado por DM');
              } catch (dmErr) {
                logger.error('[levels] ❌ No se pudo enviar ni por canal ni por DM:', dmErr?.message);
              }
            }

            // Verificar badges automáticos después del anuncio
            try {
              const newBadges = await checkAndGrantBadges(message.guild, userId);
              if (newBadges.length) {
                const badgeList = newBadges.map(b => `${b.icon || '🏅'} **${b.name}**`).join(', ');
                
                // Enviar badges al mismo lugar que el anuncio
                try {
                  await target.send({
                    content: `🎖️ <@${userId}> desbloqueó nuevos logros: ${badgeList}`,
                    allowedMentions: { parse: [] }
                  }).catch(() => {});
                } catch {}
                
                // También enviar por DM
                try {
                  const dm = await message.author.createDM();
                  await dm.send({
                    content: `🎉 ¡Felicidades! Desbloqueaste nuevos logros:\n${newBadges.map(b => `${b.icon || '🏅'} **${b.name}** - ${b.desc || 'Logro especial'}`).join('\n')}`
                  });
                } catch (dmErr) {
                  logger.info('[badges] No se pudo enviar DM:', dmErr.message);
                }
              }
            } catch (e) {
              logger.warn('[badges] Error verificando logros:', e?.message);
            }
          }

          // Actualiza timestamp de último XP solo si se otorgó XP
          lastXpAward.set(userId, now);
        }
      }

      // === DROP INTERACTIVO POR REACCIÓN ===
      dropState[guildId] = dropState[guildId] || { count: 0, lastDropMsgId: null };
      dropState[guildId].count++;

      if (dropState[guildId].count >= DROP_TRIGGER) {
        dropState[guildId].count = 0;

        const dropKey = `${guildId}:drop`;
        if (dropState[guildId].activeDrop || !shouldSendAutoMessage('drop', dropKey, 30_000)) {
          return;
        }

        dropState[guildId].activeDrop = true;
        dropState[guildId].dropTotal = (dropState[guildId].dropTotal || 0) + 1;

        // Determinar tipo de drop
        let dropType = 'coins';
        let dropIcon = DROP_EMOJI;
        let dropText = '¡Drop de monedas!';
        let dropPrizeMin = DROP_AMOUNT_MIN;
        let dropPrizeMax = DROP_AMOUNT_MAX;
        if (dropState[guildId].dropTotal % 10 === 0) {
          dropType = 'mega';
          dropIcon = '🪙🪙🪙';
          dropText = '¡MEGA DROP!';
          dropPrizeMin = 1000;
          dropPrizeMax = 2500;
        } else if (Math.random() < 0.1) { // 10% cofres
          dropType = 'chest';
          dropIcon = '🗝️';
          dropText = '¡Drop de cofres!';
          dropPrizeMin = 1;
          dropPrizeMax = 2;
        }

        // Enviar mensaje de drop embed
        const { EmbedBuilder } = require('discord.js');
        const dropEmbed = new EmbedBuilder()
          .setColor(dropType === 'mega' ? 0xFFD700 : dropType === 'chest' ? 0x8BD3FF : 0x43b581)
          .setTitle(dropText)
          .setDescription(`Reacciona con ${dropIcon} en los próximos 30 segundos para participar.`);
        const dropMsg = await message.channel.send({ embeds: [dropEmbed] });
        dropState[guildId].lastDropMsgId = dropMsg.id;
        await dropMsg.react(dropType === 'mega' ? '💰' : dropIcon);

        // Esperar 30 segundos y elegir ganador
        setTimeout(async () => {
          try {
            const fetchedMsg = await message.channel.messages.fetch(dropMsg.id);
            const users = await fetchedMsg.reactions.cache.get(dropType === 'mega' ? '💰' : dropIcon)?.users.fetch();
            const participants = users?.filter(u => !u.bot)?.map(u => u.id) || [];

            let winnerId, prize;
            if (participants.length === 0) {
              // Nadie participó, elegir usuario aleatorio del servidor
              const allMembers = await message.guild.members.fetch();
              const eligible = allMembers.filter(m => !m.user.bot && m.user.id !== message.client.user.id);
              if (eligible.size === 0) return;
              winnerId = eligible.random().id;
            } else {
              winnerId = participants[Math.floor(Math.random() * participants.length)];
            }
            prize = Math.floor(Math.random() * (dropPrizeMax - dropPrizeMin + 1)) + dropPrizeMin;

            // Entregar premio
            if (dropType === 'coins' || dropType === 'mega') {
              addCoins(guildId, winnerId, prize);
            } else if (dropType === 'chest') {
              const { addChests } = require('../utils/chestStore');
              addChests(guildId, winnerId, prize);
            }

            // Embed ganador
            const winnerEmbed = new EmbedBuilder()
              .setColor(dropType === 'mega' ? 0xFFD700 : dropType === 'chest' ? 0x8BD3FF : 0x43b581)
              .setTitle(dropType === 'mega' ? '🏆 ¡MEGA DROP GANADO!' : dropType === 'chest' ? '🏆 ¡Drop de Cofre Ganado!' : '🏆 ¡Drop Ganado!')
              .setDescription(`<@${winnerId}> ha ganado **${prize} ${dropType === 'chest' ? 'cofre(s)' : 'monedas'}** ${dropType === 'mega' ? '💰💰💰' : dropIcon}`);
            await message.channel.send({ embeds: [winnerEmbed], content: `<@${winnerId}>` });
          } catch (e) {
            logger.error('[drop] Error al procesar drop:', e);
          } finally {
            if (dropState[guildId]) {
              dropState[guildId].activeDrop = false;
            }
          }
        }, 30_000);
      }
      // === FIN DROP INTERACTIVO ===

      // Top roles debounce
      if (typeof updateTopRoles === 'function') {
        const lastUpdate = lastTopRoleUpdate.get(guildId) || 0;
        if (now - lastUpdate >= TOP_ROLES_COOLDOWN) {
          lastTopRoleUpdate.set(guildId, now);
          try {
            await updateTopRoles(message.guild);
          } catch (e) {
            logger.error('[levels] Error actualizando top roles:', e?.message);
          }
        }
      }

      // Streak diaria (independiente del XP)
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

      // Guardar niveles (mensajes + posible XP)
      writeLevels(levels);

    } catch (err) {
      logger.error('levels messageCreate error:', err);
    }
  });
};