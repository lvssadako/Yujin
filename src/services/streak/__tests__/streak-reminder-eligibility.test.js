const test = require('node:test');
const assert = require('node:assert/strict');
const { eligible } = require('../../streakReminder');

const base = {
  streakDays: 3, lastActiveDay: 20000, daysSinceActive: 1, isActiveToday: false, streakDisabled: false,
  alreadyReminded: false, alertsDisabled: false, msRemaining: 2 * 3600000
};
const check = over => eligible({ ...base, ...over });

test('racha en curso de 3 días que no ha hablado hoy: se avisa', () => {
  assert.equal(check({}), true);
  assert.equal(check({ streakDays: 4 }), true); // 3-4 días aunque aún no esté "activa" (5)
});

test('racha menor a 3 días: no se avisa', () => {
  assert.equal(check({ streakDays: 2 }), false);
  assert.equal(check({ streakDays: 1 }), false);
});

test('quien nunca habló no se avisa', () => {
  assert.equal(check({ streakDays: 0, lastActiveDay: 0, daysSinceActive: 999 }), false);
  assert.equal(check({ lastActiveDay: 0, daysSinceActive: 999 }), false);
});

test('racha ya rota (última actividad hace 2+ días) no se avisa aunque conserve el contador', () => {
  assert.equal(check({ streakDays: 10, daysSinceActive: 2 }), false);
  assert.equal(check({ streakDays: 10, daysSinceActive: 30 }), false);
});

test('ya habló hoy, ya avisado, racha desactivada, alertas apagadas o fuera de la ventana: no se avisa', () => {
  assert.equal(check({ isActiveToday: true, daysSinceActive: 0 }), false);
  assert.equal(check({ alreadyReminded: true }), false);
  assert.equal(check({ streakDisabled: true }), false);
  assert.equal(check({ alertsDisabled: true }), false);
  assert.equal(check({ msRemaining: 4 * 3600000 }), false);
  assert.equal(check({ msRemaining: 0 }), false);
});
