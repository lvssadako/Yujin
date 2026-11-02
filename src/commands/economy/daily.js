const { createEmbed, COLORS } = require('../../utils/ui');
const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { readConfig } = require('../../utils/configCache');
const { getBalance } = require('../../services/economy/index').economyService;
const { getDaily } = require('../../utils/dailyMissions');
const { dailyRewardService } = require('../../services/economy/dailyRewardService');
const logger = require('../../utils/logger');

const { buildDailyEmbed } = require('../../utils/dailyView');
const { formatNumber, clip } = require('../../utils/ui');

function streakEmoji() { return '🔥'; }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Reclama tu recompensa diaria y revisa tus misiones diarias'),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.user?.id) return interaction.reply({ content: 'Este comando solo puede usarse en servidores.', flags: 64 });
    await (interaction.deferReply?.({ flags: 64 }) || interaction.deferReply?.());
    const cfg = readConfig();
    const tz = cfg.timezone || 0;

    const now = Date.now();
    const today = Math.floor((now + tz * 3600000) / 86400000);
    const nextDayStart = (today + 1) * 86400000 - tz * 3600000;
    const endTs = Math.floor(nextDayStart / 1000);

    let profiles = readProfiles();
    let p = ensureUser(profiles, interaction.guildId, interaction.user.id);
    const canClaimDaily = (p.lastDailyDay || 0) !== today;
    const streak = p.dailyStreak || 0;

    const missions = getDaily(interaction.guild, interaction.user.id, tz);
    const bal = getBalance(interaction.guildId, interaction.user.id);

    const embed = buildDailyEmbed(canClaimDaily, endTs, bal, streak, missions);

    const buttons = [];
    buttons.push(
      new ButtonBuilder()
        .setCustomId('daily_claim')
        .setLabel(canClaimDaily ? '🎁 Reclamar Daily' : 'Recompensa cobrada')
        .setStyle(canClaimDaily ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(!canClaimDaily)
    );

    const claimables = missions.filter(m => m.completed && !m.claimed).slice(0, 4);
    for (const m of claimables) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`dclaim_${m.id}`)
          .setLabel(`Cobrar: ${clip(m.desc || m.id, 45)}`)
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
      try {
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

      if (i.deferUpdate) await i.deferUpdate();
      const answer = async data => {
        if (i.deferred || i.replied) return i.followUp(data);
        return i.reply(data);
      };
      let shouldUpdate = true;

      if (i.customId === 'daily_claim') {
        const todayNow = Math.floor((Date.now() + tz * 3600000) / 86400000);
        const result = dailyRewardService.claimDaily({
          guildId: interaction.guildId, userId: interaction.user.id,
          day: todayNow, base: cfg.dailyCoins || 250
        });
        profiles = readProfiles();
        p = ensureUser(profiles, interaction.guildId, interaction.user.id);
        if (!result.success) {
          try {
            await answer({ content: 'Ya cobraste la recompensa de hoy. Vuelve después de la próxima renovación.', flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ content: 'Ya cobraste la recompensa de hoy. Vuelve después de la próxima renovación.', flags: 64 });
            }
          }
          shouldUpdate = false;
        } else {
          const { base, bonus, total } = result;

          const newBal = getBalance(interaction.guildId, interaction.user.id);
          const sEmoji = streakEmoji(p.dailyStreak);

          const claimEmbed = createEmbed()
            .setAuthor({ name: '🎁 ¡Daily Reclamado!' })
            .setColor(COLORS.success)
            .addFields(
              { name: '🪙 Recompensa', value: `**+${total.toLocaleString()} 🪙**${bonus > 0 ? `\n> Base: ${base} + Bonus racha: ${bonus}` : ''}`, inline: true },
              { name: 'Racha de recompensas', value: `**${p.dailyStreak} día${p.dailyStreak !== 1 ? 's' : ''}**`, inline: true },
              { name: '💰 Nuevo Balance', value: `**${newBal.coins.toLocaleString()} 🪙**`, inline: true }
            )
            .setFooter({ text: 'Vuelve mañana para mantener tu racha de recompensas.' })
            .setTimestamp();

          try {
            await answer({ embeds: [claimEmbed], flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ embeds: [claimEmbed], flags: 64 });
            }
          }
        }
      }

      if (i.customId.startsWith('dclaim_')) {
        const id = i.customId.replace('dclaim_', '');
        const reward = dailyRewardService.claimMission({
          guildId: interaction.guildId, userId: interaction.user.id, missionId: id,
          day: Math.floor((Date.now() + tz * 3600000) / 86400000)
        });
        if (!reward) {
          try {
            await answer({ content: 'Esta misión todavía no está lista para cobrar o ya la cobraste. Consulta el panel actualizado.', flags: 64 });
          } catch (err) {
            if (err.code === 10062 && i.followUp) {
              await i.followUp({ content: 'Esta misión todavía no está lista para cobrar o ya la cobraste. Consulta el panel actualizado.', flags: 64 });
            }
          }
          shouldUpdate = false;
        } else {
          const rewardParts = [];
          if (reward.coins) rewardParts.push(`${reward.coins} 🪙`);
          if (reward.xp) rewardParts.push(`${reward.xp} XP`);
          if (reward.gems) rewardParts.push(`${reward.gems} 💎`);

          try {
            await answer({ content: `🎁 **¡Misión completada!** Recibiste: ${rewardParts.join(' · ')}`, flags: 64 });
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
        profiles = readProfiles();
        p = ensureUser(profiles, interaction.guildId, interaction.user.id);
        const canClaim2 = (p.lastDailyDay !== today2);
        const currentStreak = p.dailyStreak || 0;

        const embed2 = buildDailyEmbed(canClaim2, endTs2, bal2, currentStreak, updatedMissions);

        const newButtons = [];
        newButtons.push(
          new ButtonBuilder()
            .setCustomId('daily_claim')
            .setLabel(canClaim2 ? '🎁 Reclamar Daily' : 'Recompensa cobrada')
            .setStyle(canClaim2 ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(!canClaim2)
        );
        const claimables2 = updatedMissions.filter(m => m.completed && !m.claimed).slice(0, 4);
        for (const m of claimables2) {
          newButtons.push(new ButtonBuilder().setCustomId(`dclaim_${m.id}`).setLabel(`Cobrar: ${clip(m.desc || m.id, 45)}`).setStyle(ButtonStyle.Primary));
        }
        const rows2 = newButtons.length ? [new ActionRowBuilder().addComponents(newButtons)] : [];

        await msg.edit({ embeds: [embed2], components: rows2 });
      }
      } catch (error) {
        logger.error('[daily] Error al reclamar recompensa', { error: error.message });
        if (i.followUp) await i.followUp({ content: 'No pude completar la recompensa. Intenta nuevamente.', flags: 64 }).catch(() => {});
      }
    });
    collector.on('end', async () => {
      const disabled = (msg.components || rows).map(row => ActionRowBuilder.from(row).setComponents(
        row.components.map(button => ButtonBuilder.from(button).setDisabled(true))
      ));
      await msg.edit({ components: disabled }).catch(() => {});
    });
  },
  async executePrefix(message, args, client) {
    if (!message.guild || !message.member || !message.author || !message.guild.id) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }
    let replyMessage;
    const fakeInteraction = {
      guild: message.guild,
      guildId: message.guild.id,
      user: message.author,
      deferReply: async () => {},
      editReply: async data => {
        if (replyMessage) return replyMessage.edit(data);
        replyMessage = await message.reply(data);
        return replyMessage;
      },
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