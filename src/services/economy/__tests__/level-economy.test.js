const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { xpToNext } = require('../../../constants/levelCurve');
const E = require('../levelEconomy');

test('la curva de XP conserva exactamente la fórmula anterior (no cambia el progreso de nadie)', () => {
  for (const level of [0, 1, 5, 10, 25, 50, 100]) assert.equal(xpToNext(level), Math.round(200 * Math.pow(level + 1, 1.4)));
  assert.equal(xpToNext(0), 200);
});

test('la fórmula de XP vive en un solo archivo', () => {
  const root = path.resolve(__dirname, '../../..');
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); continue; }
      if (!entry.name.endsWith('.js')) continue;
      if (/Math\.pow\(\s*level\s*\+\s*1\s*,\s*1\.4\s*\)/.test(fs.readFileSync(full, 'utf8')) && !full.endsWith(path.join('constants', 'levelCurve.js'))) offenders.push(path.relative(root, full));
    }
  })(root);
  assert.deepEqual(offenders, []);
});

test('monedas por nivel: base + perLevel × nivel con tope, configurable y a prueba de valores raros', () => {
  assert.equal(E.coinsForLevel(1, {}), 110);
  assert.equal(E.coinsForLevel(10, {}), 200);
  assert.equal(E.coinsForLevel(500, {}), 1000); // tope
  assert.equal(E.coinsForLevel(5, { levelUpCoins: { base: 50, perLevel: 20, max: 500 } }), 150);
  assert.equal(E.coinsForLevel(-3, {}), 100);
  assert.deepEqual(E.resolveLevelUpConfig({ levelUpCoins: { base: 'x', perLevel: -5, max: 1e12 } }), { base: 100, perLevel: 0, max: 1000000 });
});

test('subir varios niveles de golpe paga cada uno (el actual y los anteriores)', () => {
  assert.equal(E.levelUpCoinReward(10, 1, {}), 200);
  assert.equal(E.levelUpCoinReward(10, 3, {}), 200 + 190 + 180);
  assert.equal(E.levelUpCoinReward(10, 0, {}), 0);
  assert.equal(E.levelUpCoinReward(10, 'x', {}), 0);
});

test('la misma regla para mensajes, reacciones y voz: ya no hay 100 vs 1000 vs 0', () => {
  const sources = ['events/messageCreate_levels.js', 'events/messageReactionAdd_levels.js', 'events/voiceStateUpdate_levels.js'];
  for (const file of sources) {
    const code = fs.readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
    assert.match(code, /levelUpCoinReward\(/, file);
    assert.doesNotMatch(code, /addCoins\([^)]*\b1000 \* leveledUpCount/, file);
    assert.doesNotMatch(code, /addCoins\([^)]*\b100 \* leveledUpCount/, file);
  }
});

test('voz: monedas por minuto escaladas por la actividad, nunca negativas ni mayores al tope', () => {
  assert.equal(E.voiceCoinReward(600, 1, {}), 30);        // 10 min × 3
  assert.equal(E.voiceCoinReward(600, 0.2, {}), 6);       // sordo: 20 %
  assert.equal(E.voiceCoinReward(600, 0.5, { voiceCoinsPerMinute: 10 }), 50);
  assert.equal(E.voiceCoinReward(600, 1, { voiceCoinsPerMinute: 0 }), 0);
  assert.equal(E.voiceCoinReward(600, 1, { voiceCoinsPerMinute: 999 }), 200); // tope 20/min
  assert.equal(E.voiceCoinReward(-5, 1, {}), 0);
  assert.equal(E.voiceCoinReward(600, 7, {}), 30);        // la actividad se recorta a 1
  assert.equal(E.voiceCoinReward(30, 1, {}), 1);          // 0.5 min → 1.5 → 1
});
