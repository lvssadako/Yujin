const { createEmbed, COLORS } = require('../../utils/ui');
const { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require('discord.js');
const { readProfiles, ensureUser } = require('../../utils/profileStore');
const { readConfig } = require('../../utils/configCache');
const { getBalance } = require('../../services/economy/index').economyService;
const { getDaily } = require('../../utils/dailyMissions');
const { dailyRewardService } = require('../../services/economy/dailyRewardService');
const { fetchImageBuffer } = require('../../services/image/imageService');
const { buildDailyCardAttachment } = require('../../services/image/dailyCard');
const logger = require('../../utils/logger');

const { buildDailyEmbed, previewDailyReward, weekTrackerText } = require('../../utils/dailyView');
const { perksFor, withBonus } = require('../../services/boost/boosterPerks');
const { formatNumber, clip } = require('../../utils/ui');

const dayOf = (tz, now = Date.now()) => Math.floor((now + tz * 3600000) / 86400000);
const endOfDayTs = (tz, now = Date.now()) => Math.floor(((dayOf(tz, now) + 1) * 86400000 - tz * 3600000) / 1000);

// Recompensa base del día; los Boosters reciben un extra (config.boosterPerks.dailyBonus) sobre la base.
const dailyBase = (interaction, cfg) => withBonus(cfg.dailyCoins || 250, perksFor(interaction.member, cfg).dailyBonus);

// Construye todo el panel (embed + tarjeta + botones) a partir del estado actual.
async function renderPanel(interaction, cfg, tz) {
  const guildId = interaction.guildId; const userId = interaction.user.id;
  const today = dayOf(tz);
  const profile = ensureUser(readProfiles(), guildId, userId);
  const canClaim = (profile.lastDailyDay || 0) !== today;
  const base = dailyBase(interaction, cfg);
  const preview = previewDailyReward({ streak: profile.dailyStreak || 0, lastDailyDay: profile.lastDailyDay || 0, today, base });
  const missions = getDaily(interaction.guild, userId, tz);
  const balance = getBalance(guildId, userId);

  const card = await buildDailyCardAttachment(
    { user: interaction.user, streak: preview.effectiveStreak, canClaim, reward: preview.total, balance, missions }, fetchImageBuffer);
  const embed = buildDailyEmbed(canClaim, endOfDayTs(tz), balance, preview.effectiveStreak, missions, {
    reward: preview, hasCard: Boolean(card), avatarURL: interaction.user.displayAvatarURL?.(), tipIndex: today
  });

  const buttons = [
    new ButtonBuilder().setCustomId('daily_claim')
      .setLabel(canClaim ? 'Reclamar Daily' : 'Recompensa cobrada').setEmoji(canClaim ? '🎁' : '✅')
      .setStyle(canClaim ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canClaim)
  ];
  for (const m of missions.filter(x => x.completed && !x.claimed).slice(0, 4)) {
    buttons.push(new ButtonBuilder().setCustomId(`dclaim_${m.id}`).setLabel(`Cobrar: ${clip(m.desc || m.id, 45)}`).setEmoji('🎯').setStyle(ButtonStyle.Primary));
  }
  return { embed, files: card ? [card] : [], rows: [new ActionRowBuilder().addComponents(buttons)] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Reclama tu recompensa diaria y revisa tus misiones diarias'),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.user?.id) return interaction.reply({ content: 'Este comando solo puede usarse en servidores.', flags: 64 });
    await (interaction.deferReply?.({ flags: 64 }) || interaction.deferReply?.());
    const cfg = readConfig();
    const tz = cfg.timezone || 0;

    const panel = await renderPanel(interaction, cfg, tz);
    const msg = await interaction.editReply({ embeds: [panel.embed], components: panel.rows, files: panel.files });

    const collector = msg.createMessageComponentCollector
      ? msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 240000 })
      : null;
    if (!collector) return;

    collector.on('collect', async i => {
      try {
        if (i.user.id !== interaction.user.id) {
          await i.reply({ content: 'Solo tú puedes usar estos botones.', flags: 64 }).catch(async err => {
            if (err.code === 10062 && i.followUp) await i.followUp({ content: 'Solo tú puedes usar estos botones.', flags: 64 });
          });
          return;
        }

        if (i.deferUpdate) await i.deferUpdate();
        const answer = async data => {
          try { return (i.deferred || i.replied) ? await i.followUp(data) : await i.reply(data); }
          catch (err) { if (err.code === 10062 && i.followUp) return i.followUp(data); throw err; }
        };
        let shouldUpdate = true;

        if (i.customId === 'daily_claim') {
          const result = dailyRewardService.claimDaily({
            guildId: interaction.guildId, userId: interaction.user.id, day: dayOf(tz), base: dailyBase(interaction, cfg)
          });
          if (!result.success) {
            await answer({ content: 'Ya cobraste la recompensa de hoy. Vuelve después de la próxima renovación.', flags: 64 });
            shouldUpdate = false;
          } else {
            const { base, bonus, total, streak } = result;
            const newBal = getBalance(interaction.guildId, interaction.user.id);
            const claimEmbed = createEmbed(COLORS.success)
              .setAuthor({ name: '🎁 ¡Daily Reclamado!', iconURL: interaction.user.displayAvatarURL?.() })
              .setDescription('**+' + formatNumber(total) + ' 🪙** a tu billetera' + (bonus > 0 ? '\n> Base **' + formatNumber(base) + '** + bonus de racha **' + formatNumber(bonus) + '**' : ''))
              .addFields(
                { name: '🔥 Racha de recompensas', value: weekTrackerText(streak, true) + '\n**' + streak + ' día' + (streak !== 1 ? 's' : '') + '**', inline: false },
                { name: '💰 Nuevo balance', value: '**' + formatNumber(newBal.coins) + ' 🪙**', inline: true },
                { name: '⏰ Próxima recompensa', value: '<t:' + endOfDayTs(tz) + ':R>', inline: true }
              )
              .setFooter({ text: 'Vuelve mañana para mantener tu racha de recompensas.' })
              .setTimestamp();
            await answer({ embeds: [claimEmbed], flags: 64 });
          }
        }

        if (i.customId.startsWith('dclaim_')) {
          const id = i.customId.replace('dclaim_', '');
          const reward = dailyRewardService.claimMission({ guildId: interaction.guildId, userId: interaction.user.id, missionId: id, day: dayOf(tz) });
          if (!reward) {
            await answer({ content: 'Esta misión todavía no está lista para cobrar o ya la cobraste. Consulta el panel actualizado.', flags: 64 });
            shouldUpdate = false;
          } else {
            const parts = [];
            if (reward.coins) parts.push(`${formatNumber(reward.coins)} 🪙`);
            if (reward.xp) parts.push(`${formatNumber(reward.xp)} XP`);
            if (reward.gems) parts.push(`${formatNumber(reward.gems)} 💎`);
            await answer({ content: `🎁 **¡Misión completada!** Recibiste: ${parts.join(' · ')}`, flags: 64 });
          }
        }

        if (shouldUpdate) {
          const fresh = await renderPanel(interaction, cfg, tz);
          await msg.edit({ embeds: [fresh.embed], components: fresh.rows, files: fresh.files, attachments: [] });
        }
      } catch (error) {
        logger.error('[daily] Error al reclamar recompensa', { error: error.message });
        if (i.followUp) await i.followUp({ content: 'No pude completar la recompensa. Intenta nuevamente.', flags: 64 }).catch(() => {});
      }
    });
    collector.on('end', async () => {
      const disabled = (msg.components || panel.rows).map(row => ActionRowBuilder.from(row).setComponents(
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
  },
  renderPanel
};
