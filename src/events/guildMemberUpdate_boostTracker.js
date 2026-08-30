const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
const { Events, EmbedBuilder } = require('discord.js');
const { checkAndGrantBadges } = require('../utils/badgeManager');
const { addCoins } = require('../src/services/economy').economyService;
const { validateChannelForSending } = require('../utils/channelValidation');
const { createBoostEmbed, createInfoEmbed } = require('../utils/embedFactory');

const dataDir = path.join(__dirname, '..', 'data');
const boostsPath = path.join(dataDir, 'boosts.json');
const cfgPath = path.join(__dirname, '..', 'config.json');

function readBoosts() {
  try { return JSON.parse(fs.readFileSync(boostsPath, 'utf8')); } catch { return {}; }
}
function writeBoosts(obj) {
  fs.writeFileSync(boostsPath, JSON.stringify(obj, null, 2), 'utf8');
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; }
}

async function resolveBoostAnnouncementChannel(guild, config, type = 'added') {
  if (!guild || !guild.channels) return null;

  const specificId = type === 'added'
    ? config.boostAddedChannelId
    : type === 'removed'
      ? config.boostRemovedChannelId
      : null;

  if (specificId) {
    const validation = await validateChannelForSending(guild, specificId);
    if (validation.valid) return validation.channel;
  }

  const genericId = config.boostChannelId;
  if (genericId) {
    const validation = await validateChannelForSending(guild, genericId);
    if (validation.valid) return validation.channel;
  }

  return null;
}

// Antispam para updates duplicados
const lastEvents = new Map(); // key: `${gid}:${uid}` -> { state: 'on'|'off', ts: number }
const lastAnnouncementByUser = new Map(); // key: `${gid}:${uid}:${type}` -> ts

module.exports = (client) => {
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    try {
      if (!newMember || !newMember.guild) return;

      const guild = newMember.guild;
      const gid = guild.id;
      const uid = newMember.id;

      const wasBooster = !!(oldMember && oldMember.premiumSince);
      const isBooster = !!newMember.premiumSince;

      // Evitar duplicados (mismo estado dentro de 60s)
      const key = `${gid}:${uid}`;
      const prev = lastEvents.get(key);
      const now = Date.now();
      const newState = isBooster ? 'on' : 'off';
      if (prev && prev.state === newState && now - prev.ts < 60000) {
        return;
      }
      lastEvents.set(key, { state: newState, ts: now });

      const boosts = readBoosts();
      boosts[gid] = boosts[gid] || {};
      let entry = boosts[gid][uid];

      // Migrar de número a objeto si es necesario
      if (typeof entry === 'number') {
        boosts[gid][uid] = {
          count: entry,
          isBooster: false,
          lastStart: 0,
          lastStop: 0,
          firstBoost: null,
          lastWeeklyReward: 0
        };
        writeBoosts(boosts);
        entry = boosts[gid][uid];
      }
      if (!entry || typeof entry !== 'object') {
        entry = {
          count: 0,
          isBooster: false,
          lastStart: 0,
          lastStop: 0,
          firstBoost: null,
          lastWeeklyReward: 0
        };
      }

      const config = readConfig();
      const addedChannel = await resolveBoostAnnouncementChannel(guild, config, 'added');
      const removedChannel = await resolveBoostAnnouncementChannel(guild, config, 'removed');

      // Empezó a boostear (cuenta +1 cada transición off->on)
      if (!wasBooster && isBooster) {
        const announcementKey = `${gid}:${uid}:added`;
        const lastAnnouncementTs = lastAnnouncementByUser.get(announcementKey) || 0;
        if (now - lastAnnouncementTs >= 30000) {
          lastAnnouncementByUser.set(announcementKey, now);
        } else {
          return;
        }

        entry.count = (entry.count || 0) + 1;
        entry.isBooster = true;
        entry.lastStart = now;

        // ✅ RECOMPENSA POR PRIMERA VEZ
        if (!entry.firstBoost) {
          entry.firstBoost = now;
          addCoins(gid, uid, 10000);

          try {
            await newMember.send(
              `🎉 ¡Gracias por boostear **${guild.name}**!\n` +
              `🪙 Has recibido **10,000 monedas** como recompensa inicial.\n` +
              `🪙 Recibirás **5,000 monedas** semanales mientras mantengas el boost activo.`
            );
          } catch {}

          logger.info(`💰 ${newMember.user.tag} recibió 10,000 monedas (primer boost);`);
        }

        boosts[gid][uid] = entry;
        writeBoosts(boosts);

        logger.info(`🚀 ${newMember.user.tag} comenzó a boostear ${guild.name} (veces: ${entry.count});`);

        // Badges automáticos
        try {
          const newBadges = await checkAndGrantBadges(guild, uid);
          if (newBadges.length > 0) {
            const badgeList = newBadges.map(b => `${b.icon || '🏅'} ${b.name}`).join(', ');
            logger.info(`[badges] otorgados a ${newMember.user.tag}: ${badgeList}`);
            try {
              await newMember.send(`💎 ¡Gracias por boostear **${guild.name}**!\n🎖️ Desbloqueaste: ${badgeList}`);
            } catch {}
          }
        } catch {}

        if (addedChannel) {
          const embed = createBoostEmbed(
            newMember.user,
            `💎 ¡Nuevo Booster!\nUsuario: ${newMember.user}\nVeces que ha boosteado: **${entry.count}**`
          );
          await addedChannel.send({ embeds: [embed] }).catch(() => {});
        }
        return;
      }

      // Dejó de boostear (on->off)
      if (wasBooster && !isBooster) {
        const announcementKey = `${gid}:${uid}:removed`;
        const lastAnnouncementTs = lastAnnouncementByUser.get(announcementKey) || 0;
        if (now - lastAnnouncementTs >= 30000) {
          lastAnnouncementByUser.set(announcementKey, now);
        } else {
          return;
        }

        entry.isBooster = false;
        entry.lastStop = now;
        boosts[gid][uid] = entry;
        writeBoosts(boosts);

        logger.info(`💨 ${newMember.user.tag} dejó de boostear ${guild.name}`);

        if (removedChannel) {
          const embed = createInfoEmbed(
            '💨 Boost Removido',
            `Usuario: ${newMember.user}`
          );
          embed.setAuthor({ name: newMember.user.username, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) });
          await removedChannel.send({ embeds: [embed] }).catch(() => {});
        }
        return;
      }

    } catch (e) {
      logger.error('[boostTracker] Error:', e);
    }
  });

  // ✅ RECOMPENSA SEMANAL AUTOMÁTICA (ejecuta cada hora)
  setInterval(async () => {
    try {
      const boosts = readBoosts();
      const now = Date.now();
      const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

      for (const gid in boosts) {
        const guild = await client.guilds.fetch(gid).catch(() => null);
        if (!guild) continue;

        for (const uid in boosts[gid]) {
          let entry = boosts[gid][uid];
          // Migrar de número a objeto si es necesario
          if (typeof entry === 'number') {
            boosts[gid][uid] = {
              count: entry,
              isBooster: false,
              lastStart: 0,
              lastStop: 0,
              firstBoost: null,
              lastWeeklyReward: 0
            };
            writeBoosts(boosts);
            entry = boosts[gid][uid];
          }
          if (!entry || typeof entry !== 'object') continue;

          // Verificar que siga boosteando
          const member = await guild.members.fetch(uid).catch(() => null);
          if (!member?.premiumSince) continue;

          // Dar recompensa semanal
          const timeSinceLastReward = now - (entry.lastWeeklyReward || entry.firstBoost || 0);
          if (timeSinceLastReward >= WEEK_MS) {
            addCoins(gid, uid, 5000);
            entry.lastWeeklyReward = now;
            boosts[gid][uid] = entry;

            logger.info(`💰 Recompensa semanal para ${member.user.tag}: +5,000 monedas`);
          }
        }
      }

      writeBoosts(boosts);
    } catch (err) {
      logger.error('[boostTracker] Error en recompensa semanal:', err);
    }
  }, 60 * 60 * 1000); // cada hora
};

module.exports.resolveBoostAnnouncementChannel = resolveBoostAnnouncementChannel;