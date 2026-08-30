const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { readConfig } = require('../../utils/configCache');
const { getBalance, addCoins } = require('../../services/economy/index').economyService;
const { getDaily, claimDaily } = require('../../utils/dailyMissions');
const { readLevels, writeLevels, ensureUserData, xpToNext } = require('../../services/level').levelService;

function bar10(progress, target) {
  const pct = target > 0 ? Math.floor((progress / target) * 100) : 0;
  const filled = Math.min(10, Math.floor(pct / 10));
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}] ${pct}%`;
}

function calcTotalRewards(missions) {
  const totals = { coins: 0, xp: 0, gems: 0 };
  for (const m of missions) {
    if (m.reward.coins) totals.coins += m.reward.coins;
    if (m.reward.xp) totals.xp += m.reward.xp;
    if (m.reward.gems) totals.gems += m.reward.gems;
  }
  return totals;
}

function streakEmoji(streak) {
  if (streak >= 30) return '🌟';
  if (streak >= 14) return '💎';
  if (streak >= 7) return '🔥';
  if (streak >= 3) return '⚡';
  return '✨';
}

function streakBar(streak) {
  const milestones = [3, 7, 14, 30];
  const nextMilestone = milestones.find(m => m > streak) || 30;
  const prevMilestone = milestones.filter(m => m <= streak).pop() || 0;
  const range = nextMilestone - prevMilestone;
  const progress = Math.min(range, streak - prevMilestone);
  const filled = range > 0 ? Math.min(10, Math.round((progress / range) * 10)) : 10;
  return `[${'🟧'.repeat(filled)}${'⬛'.repeat(10 - filled)}]`;
}

function buildDailyEmbed(canClaim, endTs, bal, streak, missions) {
  const sEmoji = streakEmoji(streak);
  const sBar = streakBar(streak);
  const base = 250;
  const bonus = Math.min(1000, Math.max(0, (streak - 1) * 10));
  const nextReward = base + bonus;

  const streakText = streak > 0
    ? `${sEmoji} **${streak} día${streak !== 1 ? 's' : ''}** de racha\n${sBar}\n> Próximo daily: **${nextReward} 🪙** ${bonus > 0 ? `*(base ${base} + ${bonus} bonus)*` : ''}`
    : `${sEmoji} **Sin racha activa**\n> ¡Reclama tu daily para empezar una racha!`;

  const dailyLine = canClaim
    ? '🟢 **Disponible ahora** — ¡Reclama tu recompensa!'
    : `🔴 **Ya reclamado** — Próximo: <t:${endTs}:R>`;

  let missionsText = '';
  let completed = 0;
  for (const m of missions) {
    const done = m.completed;
    completed += done ? 1 : 0;
    const check = done ? '✅' : '⬜';
    const progress = `\`${m.progress || 0}/${m.target}\``;
    const rewards = Object.entries(m.reward)
      .map(([k, v]) => (k === 'coins' ? `${v} 🪙` : k === 'xp' ? `${v} XP` : k === 'gems' ? `${v} 💎` : `${v} ${k}`))
      .join(' · ');
    missionsText += `${check} **${m.desc}**\n> ${bar10(m.progress || 0, m.target)} ${progress} — ${rewards}\n`;
  }

  const totalRewards = calcTotalRewards(missions);
  const rewardsText = [
    totalRewards.coins > 0 ? `${totalRewards.coins} 🪙` : '',
    totalRewards.xp > 0 ? `${totalRewards.xp} XP` : '',
    totalRewards.gems > 0 ? `${totalRewards.gems} 💎` : ''
  ].filter(r => r).join(' · ') || 'Ninguna';

  return new EmbedBuilder()
    .setAuthor({ name: '📅 Panel Diario' })
    .setColor(canClaim ? 0xF8B500 : 0x2F3136)
    .addFields(
      { name: '🔔 Estado del Daily', value: dailyLine, inline: false },
      { name: `${sEmoji} Racha Diaria`, value: streakText, inline: false },
      { name: '💰 Tu Balance', value: `**${bal.coins.toLocaleString()}** 🪙 billetera · **${bal.bank.toLocaleString()}** 🪙 banco`, inline: false },
      { name: `📋 Misiones del Día (${completed}/${missions.length})`, value: missionsText || '*No hay misiones disponibles.*', inline: false },
      { name: '🎁 Recompensas Pendientes', value: rewardsText, inline: false }
    )
    .setFooter({ text: `Renovación de misiones · Racha de ${streak} días` })
    .setTimestamp(new Date(endTs * 1000));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Reclama tu recompensa diaria y revisa tus misiones diarias'),
  async execute(interaction) {
    await (interaction.deferReply?.({ flags: 64 }) || interaction.deferReply?.());
    const cfg = readConfig();
    const tz = cfg.timezone || 0;

    const now = Date.now();
    const today = Math.floor((now + tz * 3600000) / 86400000);
    const nextDayStart = (today + 1) * 86400000 - tz * 3600000;
    const endTs = Math.floor(nextDayStart / 1000);

    const profiles = readProfiles();
    const p = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const canClaimDaily = (p.lastDailyDay || 0) !== today;
    const streak = p.dailyStreak || 0;

    const missions = getDaily(interaction.guild, interaction.user.id, tz);
    const bal = getBalance(interaction.guildId, interaction.user.id);

    const embed = buildDailyEmbed(canClaimDaily, endTs, bal, streak, missions);

    const buttons = [];
    buttons.push(
      new ButtonBuilder()
        .setCustomId('daily_claim')
        .setLabel(canClaimDaily ? '🎁 Reclamar Daily' : '✅ Ya reclamado')
        .setStyle(canClaimDaily ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!canClaimDaily)
    );

    const claimables = missions.filter(m => m.completed && !m.claimed).slice(0, 4);
    for (const m of claimables) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`dclaim_${m.id}`)
          .setLabel(`Reclamar ${m.icon || '🎁'}`)
          .setStyle(ButtonStyle.Primary)
      );
    }

    const rows = buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [];

    let msg;
    if (interaction.replied || interaction.deferred) {
      msg = await interaction.editReply({ embeds: [embed], components: rows });
    } else {
      msg = await interaction.reply({ embeds: [embed], components: rows });
    }

    if (!rows.length) return;
    const collector = msg.createMessageComponentCollector
      ? msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 240000 })
      : null;
    if (!collector) return;

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        try {
          await i.reply({ content: 'Solo tú puedes usar estos botones.', flags: 64 });
        } catch (err) {
          if (err.code === 10062 && i.followUp) {
            await i.followUp({ content: 'Solo tú puedes usar estos botones.', flags: 64 });
          }
        }
        return;
      }

      let shouldUpdate = true;

      if (i.customId === 'daily_claim') {
        const todayNow = Math.floor((Date.now() + tz * 3600000) / 86400000);
        if (p.lastDailyDay === todayNow) {
          try {
            await i.reply({ content: '❌ Ya reclamaste el daily hoy.', flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ content: '❌ Ya reclamaste el daily hoy.', flags: 64 });
            }
          }
          shouldUpdate = false;
        } else {
          const wasConsecutive = p.lastDailyDay === todayNow - 1;

          if (!p.lastDailyDay || p.lastDailyDay === 0) {
            p.dailyStreak = 1;
          } else if (wasConsecutive) {
            p.dailyStreak = (p.dailyStreak || 0) + 1;
          } else {
            p.dailyStreak = 1;
          }

          p.lastDailyDay = todayNow;
          writeProfiles(profiles);

          const base = cfg.dailyCoins || 250;
          const bonus = Math.min(1000, Math.max(0, (p.dailyStreak - 1) * 10));
          const total = base + bonus;
          addCoins(interaction.guildId, interaction.user.id, total);

          const newBal = getBalance(interaction.guildId, interaction.user.id);
          const sEmoji = streakEmoji(p.dailyStreak);

          const claimEmbed = new EmbedBuilder()
            .setAuthor({ name: '🎁 ¡Daily Reclamado!' })
            .setColor(0x57F287)
            .addFields(
              { name: '🪙 Recompensa', value: `**+${total.toLocaleString()} 🪙**${bonus > 0 ? `\n> Base: ${base} + Bonus racha: ${bonus}` : ''}`, inline: true },
              { name: `${sEmoji} Racha`, value: `**${p.dailyStreak} día${p.dailyStreak !== 1 ? 's' : ''}**`, inline: true },
              { name: '💰 Nuevo Balance', value: `**${newBal.coins.toLocaleString()} 🪙**`, inline: true }
            )
            .setFooter({ text: '¡Vuelve mañana para mantener tu racha!' })
            .setTimestamp();

          try {
            await i.reply({ embeds: [claimEmbed], flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ embeds: [claimEmbed], flags: 64 });
            }
          }
        }
      }

      if (i.customId.startsWith('dclaim_')) {
        const id = i.customId.replace('dclaim_', '');
        const reward = claimDaily(interaction.guild, interaction.user.id, id);
        if (!reward) {
          try {
            await i.reply({ content: '❌ No disponible o ya reclamado.', flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ content: '❌ No disponible o ya reclamado.', flags: 64 });
            }
          }
          shouldUpdate = false;
        } else {
          if (reward.coins) addCoins(interaction.guildId, interaction.user.id, reward.coins);
          if (reward.xp) {
            const levels = readLevels();
            const u = ensureUserData(levels, interaction.guildId, interaction.user.id);
            u.xp = (u.xp || 0) + reward.xp;
            while (u.xp >= xpToNext(u.level)) { u.xp -= xpToNext(u.level); u.level++; }
            writeLevels(levels);
          }

          const rewardParts = [];
          if (reward.coins) rewardParts.push(`${reward.coins} 🪙`);
          if (reward.xp) rewardParts.push(`${reward.xp} XP`);
          if (reward.gems) rewardParts.push(`${reward.gems} 💎`);

          try {
            await i.reply({ content: `🎁 **¡Misión completada!** Recibiste: ${rewardParts.join(' · ')}`, flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ content: `🎁 **¡Misión completada!** Recibiste: ${rewardParts.join(' · ')}`, flags: 64 });
            }
          }
        }
      }

      if (shouldUpdate) {
        const now2 = Date.now();
        const today2 = Math.floor((now2 + tz * 3600000) / 86400000);
        const nextDay2 = (today2 + 1) * 86400000 - tz * 3600000;
        const endTs2 = Math.floor(nextDay2 / 1000);

        const updatedMissions = getDaily(interaction.guild, interaction.user.id, tz);
        const bal2 = getBalance(interaction.guildId, interaction.user.id);
        const canClaim2 = (p.lastDailyDay !== today2);
        const currentStreak = p.dailyStreak || 0;

        const embed2 = buildDailyEmbed(canClaim2, endTs2, bal2, currentStreak, updatedMissions);

        const newButtons = [];
        newButtons.push(
          new ButtonBuilder()
            .setCustomId('daily_claim')
            .setLabel(canClaim2 ? '🎁 Reclamar Daily' : '✅ Ya reclamado')
            .setStyle(canClaim2 ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!canClaim2)
        );
        const claimables2 = updatedMissions.filter(m => m.completed && !m.claimed).slice(0, 4);
        for (const m of claimables2) {
          newButtons.push(new ButtonBuilder().setCustomId(`dclaim_${m.id}`).setLabel(`Reclamar ${m.icon || '🎁'}`).setStyle(ButtonStyle.Primary));
        }
        const rows2 = newButtons.length ? [new ActionRowBuilder().addComponents(newButtons)] : [];

        if (!i.replied && !i.deferred) {
          await i.update({ embeds: [embed2], components: rows2 });
        }
      }
    });
  },
  async executePrefix(message, args, client) {
    if (!message.guild || !message.member || !message.author || !message.guild.id) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }
    const fakeInteraction = {
      guild: message.guild,
      guildId: message.guild.id,
      user: message.author,
      deferReply: async () => {},
      editReply: async (data) => message.reply(data),
      reply: async (data) => message.reply(data),
      channel: message.channel,
      member: message.member,
    };
    if (!fakeInteraction.user || !fakeInteraction.user.id) {
      return message.reply('❌ No se pudo obtener tu usuario correctamente.');
    }
    await module.exports.execute(fakeInteraction, client);
  }
};