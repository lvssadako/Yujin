// Monedas que se ganan al subir de nivel y por tiempo en voz. Una sola regla para todas las vías
// (mensajes, reacciones y voz); antes mensajes pagaba 100 por nivel, reacciones 1000 y voz nada.
const DEFAULT_LEVEL_UP = Object.freeze({ base: 100, perLevel: 10, max: 1000 });
const DEFAULT_VOICE_COINS_PER_MINUTE = 3;
const MAX_VOICE_COINS_PER_MINUTE = 20;

const clampNumber = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

function resolveLevelUpConfig(cfg = {}) {
  const raw = cfg?.levelUpCoins && typeof cfg.levelUpCoins === 'object' ? cfg.levelUpCoins : {};
  return {
    base: Math.floor(clampNumber(raw.base, 0, 100000, DEFAULT_LEVEL_UP.base)),
    perLevel: Math.floor(clampNumber(raw.perLevel, 0, 10000, DEFAULT_LEVEL_UP.perLevel)),
    max: Math.floor(clampNumber(raw.max, 0, 1000000, DEFAULT_LEVEL_UP.max))
  };
}

/** Monedas por UN nivel alcanzado: base + perLevel × nivel, con tope. */
function coinsForLevel(level, cfg) {
  const { base, perLevel, max } = resolveLevelUpConfig(cfg);
  return Math.min(max, base + perLevel * Math.max(0, Math.floor(Number(level) || 0)));
}

/** Total por subir varios niveles de golpe (newLevel es el nivel final). */
function levelUpCoinReward(newLevel, levelsGained, cfg) {
  const gained = Math.max(0, Math.floor(Number(levelsGained) || 0));
  let total = 0;
  for (let i = 0; i < gained; i++) total += coinsForLevel(Number(newLevel) - i, cfg);
  return total;
}

/** Monedas por tiempo en voz, escaladas por la actividad (sordo/solo/muteado ya reducen la XP). */
function voiceCoinReward(elapsedSec, activityMult, cfg = {}) {
  const perMinute = clampNumber(cfg?.voiceCoinsPerMinute, 0, MAX_VOICE_COINS_PER_MINUTE, DEFAULT_VOICE_COINS_PER_MINUTE);
  const minutes = Math.max(0, Number(elapsedSec) || 0) / 60;
  const mult = clampNumber(activityMult, 0, 1, 1);
  return Math.max(0, Math.floor(minutes * perMinute * mult));
}

module.exports = { DEFAULT_LEVEL_UP, DEFAULT_VOICE_COINS_PER_MINUTE, resolveLevelUpConfig, coinsForLevel, levelUpCoinReward, voiceCoinReward };
