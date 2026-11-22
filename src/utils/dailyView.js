const { createEmbed, formatNumber, progressBar, clip, COLORS } = require('./ui');
const { weekProgress } = require('../services/image/dailyCard');

const MAX_STREAK_BONUS = 1000;
const BONUS_PER_DAY = 10;

function rewardText(reward = {}) {
  return [['coins', 'monedas'], ['xp', 'XP'], ['gems', 'gemas']]
    .filter(([key]) => reward[key] > 0).map(([key, label]) => formatNumber(reward[key]) + ' ' + (reward[key] === 1 && key !== 'xp' ? label.slice(0, -1) : label)).join(' · ') || 'Sin recompensa';
}

/**
 * Recompensa del próximo cobro. La racha solo continúa si se cobró ayer;
 * si se rompió, el siguiente cobro vuelve a empezar en 1 (misma regla que dailyRewardService).
 */
function previewDailyReward({ streak = 0, lastDailyDay = 0, today, base = 250 }) {
  const alive = Number(lastDailyDay) >= today - 1 && streak > 0;
  const nextStreak = alive ? streak + 1 : 1;
  const bonus = Math.min(MAX_STREAK_BONUS, Math.max(0, (nextStreak - 1) * BONUS_PER_DAY));
  return { alive, nextStreak, bonus, base, total: base + bonus, effectiveStreak: alive ? streak : 0 };
}

// 🔥🔥🔥🎁▫️▫️⭐ — ciclo semanal; el último día es el hito de la semana.
function weekTrackerText(streak, claimedToday) {
  const { done, todayIndex } = weekProgress(streak, claimedToday);
  return Array.from({ length: 7 }, (_, i) => (i < done ? '🔥' : i === todayIndex ? '🎁' : i === 6 ? '⭐' : '▫️')).join(' ');
}

const STATE_ICON = { claimed: '✅', ready: '🎁', progress: '⏳' };
function missionLine(mission, index) {
  const state = mission.claimed ? 'claimed' : mission.completed ? 'ready' : 'progress';
  const label = mission.claimed ? 'Cobrada' : mission.completed ? '**¡Lista para cobrar!**' : 'En progreso';
  const progress = formatNumber(Math.min(mission.progress || 0, mission.target)) + '/' + formatNumber(mission.target);
  return STATE_ICON[state] + ' **' + (mission.icon ? mission.icon + ' ' : '') + clip(mission.desc, 80) + '** · ' + label +
    '\n' + progressBar(mission.progress, mission.target) + ' · ' + progress + ' · ' + rewardText(mission.reward);
}

const TIPS = [
  'Cobra cada día: el bonus de racha sube +' + BONUS_PER_DAY + ' por día (hasta +' + formatNumber(MAX_STREAK_BONUS) + ').',
  'Guarda tus monedas en el banco con /bank para protegerlas de los robos.',
  'Tu racha de actividad (/streak) es independiente de la racha de recompensas.',
  'Las misiones se renuevan con el día: cóbralas antes de la renovación.',
  'Los Boosters tienen beneficios extra de XP y monedas: revisa /boosters.'
];

function buildDailyEmbed(canClaim, endTs, balance, streak, missions, extra = {}) {
  const { reward, hasCard = false, avatarURL = null, tipIndex = 0 } = extra;
  const completed = missions.filter(m => m.completed).length;
  const pending = missions.filter(m => !m.claimed).reduce((total, m) => {
    for (const key of ['coins', 'xp', 'gems']) total[key] += m.reward?.[key] || 0;
    return total;
  }, { coins: 0, xp: 0, gems: 0 });
  const readyCount = missions.filter(m => m.completed && !m.claimed).length;

  const embed = createEmbed(canClaim || readyCount ? COLORS.success : COLORS.economy)
    .setTitle(canClaim ? '🎁 ¡Tu recompensa diaria te espera!' : '✨ Recompensa de hoy cobrada')
    .setDescription(canClaim
      ? (reward ? 'Reclama **+' + formatNumber(reward.total) + ' 🪙** ahora' + (reward.bonus > 0 ? ' *(base ' + formatNumber(reward.base) + ' + bonus de racha ' + formatNumber(reward.bonus) + ')*' : '') + '. Pulsa **Reclamar Daily**.'
        : 'Tu recompensa diaria está disponible. Pulsa **Reclamar Daily**.')
      : 'Vuelve <t:' + endTs + ':R>' + (reward ? ' para cobrar **+' + formatNumber(reward.total) + ' 🪙** y llegar a **' + formatNumber(reward.nextStreak) + '** días.' : '.'));
  if (avatarURL) embed.setAuthor({ name: 'Yujin ♥ · Recompensas', iconURL: avatarURL });
  else embed.setAuthor({ name: 'Yujin ♥ · Recompensas' });

  embed.addFields(
    { name: '🔥 Racha de recompensas · ' + formatNumber(streak) + (streak === 1 ? ' día' : ' días'), value: weekTrackerText(streak, !canClaim) + '\n*Cada 7 días completas un ciclo.*', inline: false },
    { name: '🪙 Billetera', value: '**' + formatNumber(balance.coins) + '**', inline: true },
    { name: '🏦 Banco', value: '**' + formatNumber(balance.bank) + '**', inline: true },
    { name: '💰 Total', value: '**' + formatNumber(balance.coins + balance.bank) + '**', inline: true },
    {
      name: '🎯 Misiones · ' + completed + '/' + missions.length + (readyCount ? ' · ' + readyCount + ' por cobrar' : ''),
      value: clip(missions.map(missionLine).join('\n\n') || 'No hay misiones disponibles por ahora.', 1024), inline: false
    },
    {
      name: '🎒 Por ganar en misiones',
      value: !missions.length ? 'No hay misiones disponibles por ahora.' : missions.every(m => m.claimed) ? '¡Todo cobrado! Gran día. 🎉' : rewardText(pending), inline: false
    },
    { name: '⏰ Renovación', value: '<t:' + endTs + ':t> · <t:' + endTs + ':R>', inline: false }
  ).setFooter({ text: '💡 ' + TIPS[Math.abs(tipIndex) % TIPS.length] });
  if (hasCard) embed.setImage('attachment://daily-card.png');
  return embed;
}

module.exports = { buildDailyEmbed, rewardText, previewDailyReward, weekTrackerText, missionLine, TIPS };
