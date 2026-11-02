const { createEmbed, formatNumber, progressBar, clip } = require('./ui');

function rewardText(reward = {}) {
  return [['coins', 'monedas'], ['xp', 'XP'], ['gems', 'gemas']]
    .filter(([key]) => reward[key] > 0).map(([key, label]) => formatNumber(reward[key]) + ' ' + (reward[key] === 1 && key !== 'xp' ? label.slice(0, -1) : label)).join(' · ') || 'Sin recompensa';
}
function buildDailyEmbed(canClaim, endTs, balance, streak, missions) {
  const completed = missions.filter(mission => mission.completed).length;
  const pending = missions.filter(mission => !mission.claimed).reduce((total, mission) => {
    for (const key of ['coins', 'xp', 'gems']) total[key] += mission.reward?.[key] || 0;
    return total;
  }, { coins: 0, xp: 0, gems: 0 });
  const missionLines = missions.map((mission, index) => {
    const state = mission.claimed ? 'Cobrada' : mission.completed ? 'Lista para cobrar' : 'En progreso';
    return '**' + (index + 1) + '. ' + clip(mission.desc, 100) + '** · ' + state + '\n' + progressBar(mission.progress, mission.target) + '\n' + formatNumber(Math.min(mission.progress || 0, mission.target)) + '/' + formatNumber(mission.target) + ' · ' + rewardText(mission.reward);
  });
  return createEmbed().setAuthor({ name: 'Yujin ♥ · Recompensas' }).setTitle('✨ Un nuevo día para brillar')
    .setDescription(canClaim ? 'Tu recompensa diaria está disponible. Pulsa **Reclamar recompensa** para cobrarla.' : 'Ya cobraste tu recompensa de hoy. La próxima estará disponible <t:' + endTs + ':R>.')
    .addFields(
      { name: 'Racha de recompensas', value: '**' + formatNumber(streak) + (streak === 1 ? ' día' : ' días') + '**\nSe mantiene al reclamar cada día.', inline: true },
      { name: 'Billetera', value: '**' + formatNumber(balance.coins) + '** monedas', inline: true },
      { name: 'Banco', value: '**' + formatNumber(balance.bank) + '** monedas', inline: true },
      { name: 'Misiones · ' + completed + '/' + missions.length + ' completadas', value: clip(missionLines.join('\n\n') || 'No hay misiones disponibles por ahora.', 1024), inline: false },
      { name: 'Por ganar en misiones', value: !missions.length ? 'No hay misiones disponibles por ahora.' : missions.every(mission => mission.claimed) ? 'Todas las recompensas están cobradas.' : rewardText(pending), inline: false },
      { name: 'Renovación', value: '<t:' + endTs + ':f> · <t:' + endTs + ':R>', inline: false }
    ).setFooter({ text: 'Horario de recompensas del servidor · Tu racha de actividad se consulta con /streak ver' });
}
module.exports = { buildDailyEmbed, rewardText };
