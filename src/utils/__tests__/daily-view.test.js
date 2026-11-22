const test = require('node:test');
const assert = require('node:assert/strict');
const { previewDailyReward, weekTrackerText, buildDailyEmbed, missionLine } = require('../dailyView');
const { weekProgress, generateDailyCard } = require('../../services/image/dailyCard');

test('vista previa: racha viva suma bonus, racha rota reinicia en 1', () => {
  const alive = previewDailyReward({ streak: 5, lastDailyDay: 99, today: 100, base: 250 });
  assert.deepEqual([alive.alive, alive.nextStreak, alive.bonus, alive.total, alive.effectiveStreak], [true, 6, 50, 300, 5]);
  const broken = previewDailyReward({ streak: 9, lastDailyDay: 90, today: 100, base: 250 });
  assert.deepEqual([broken.alive, broken.nextStreak, broken.bonus, broken.total, broken.effectiveStreak], [false, 1, 0, 250, 0]);
  const fresh = previewDailyReward({ streak: 0, lastDailyDay: 0, today: 100 });
  assert.equal(fresh.total, 250);
});

test('vista previa: el bonus se limita a 1000', () => {
  assert.equal(previewDailyReward({ streak: 500, lastDailyDay: 99, today: 100, base: 0 }).bonus, 1000);
});

test('misma fórmula que el servicio de cobro (racha 6 → bonus 50)', () => {
  const { createDailyRewardService } = require('../../services/economy/dailyRewardService');
  assert.equal(typeof createDailyRewardService, 'function');
  assert.equal(previewDailyReward({ streak: 5, lastDailyDay: 99, today: 100, base: 0 }).bonus, Math.min(1000, Math.max(0, (6 - 1) * 10)));
});

test('ciclo semanal: casillas cumplidas y casilla de hoy', () => {
  assert.deepEqual(weekProgress(0, false), { done: 0, todayIndex: 0 });
  assert.deepEqual(weekProgress(3, false), { done: 3, todayIndex: 3 });
  assert.deepEqual(weekProgress(3, true), { done: 3, todayIndex: -1 });
  assert.deepEqual(weekProgress(7, true), { done: 7, todayIndex: -1 });
  assert.deepEqual(weekProgress(8, true), { done: 1, todayIndex: -1 });
  assert.deepEqual(weekProgress(7, false), { done: 0, todayIndex: 0 });
  assert.equal(weekTrackerText(3, false), '🔥 🔥 🔥 🎁 ▫️ ▫️ ⭐');
  assert.equal(weekTrackerText(7, true), '🔥 🔥 🔥 🔥 🔥 🔥 🔥');
});

const missions = [
  { id: 'a', desc: 'Envía 50 mensajes', icon: '💬', target: 50, progress: 50, completed: true, claimed: false, reward: { coins: 100 } },
  { id: 'b', desc: 'Pasa 30 min en voz', icon: '🎤', target: 30, progress: 10, completed: false, claimed: false, reward: { coins: 150, xp: 20 } },
  { id: 'c', desc: 'Añade 10 reacciones', icon: '⭐', target: 10, progress: 10, completed: true, claimed: true, reward: { coins: 80 } }
];

test('embed del daily: respeta límites de Discord y muestra estados', () => {
  for (const canClaim of [true, false]) {
    const embed = buildDailyEmbed(canClaim, 1900000000, { coins: 1234, bank: 99 }, 3, missions,
      { reward: previewDailyReward({ streak: 3, lastDailyDay: 99, today: 100 }), hasCard: true, tipIndex: -3 }).toJSON();
    assert.ok(embed.title.length <= 256);
    assert.ok(embed.description.length <= 4096);
    for (const f of embed.fields) { assert.ok(f.name.length <= 256); assert.ok(f.value.length <= 1024); }
    assert.ok(embed.fields.length <= 25);
    assert.equal(embed.image.url, 'attachment://daily-card.png');
    assert.match(embed.title, canClaim ? /te espera/ : /cobrada/);
  }
  assert.match(missionLine(missions[0], 0), /🎁.*¡Lista para cobrar!/s);
  assert.match(missionLine(missions[1], 1), /⏳/);
  assert.match(missionLine(missions[2], 2), /✅/);
});

test('embed del daily: sin misiones ni tarjeta sigue siendo válido', () => {
  const embed = buildDailyEmbed(true, 1900000000, { coins: 0, bank: 0 }, 0, []).toJSON();
  assert.equal(embed.image, undefined);
  assert.match(JSON.stringify(embed.fields), /No hay misiones/);
});

test('la tarjeta se genera como PNG válido incluso sin avatar', async () => {
  const png = await generateDailyCard({ user: { username: 'prueba' }, streak: 3, canClaim: true, reward: 280, balance: { coins: 10, bank: 5 }, missions });
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});
