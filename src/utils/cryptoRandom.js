const crypto = require('crypto');

/**
 * Generates a cryptographically secure random float in the range [0, 1).
 * Replaces Math.random() in security-sensitive contexts.
 * @returns {number}
 */
function secureRandom() {
  return crypto.randomBytes(4).readUInt32LE(0) / 0x100000000;
}

/**
 * Generates a cryptographically secure integer in the range [min, max] (inclusive).
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function secureRandomInt(min, max) {
  const floorMin = Math.floor(min);
  const floorMax = Math.floor(max);
  if (floorMin >= floorMax) return floorMin;
  return crypto.randomInt(floorMin, floorMax + 1);
}

/**
 * Randomly picks an element from an array using cryptographically secure randomness.
 * @template T
 * @param {T[]} array
 * @returns {T|null}
 */
function secureChoice(array) {
  if (!Array.isArray(array) || array.length === 0) return null;
  const index = crypto.randomInt(0, array.length);
  return array[index];
}

module.exports = {
  secureRandom,
  secureRandomInt,
  secureChoice
};
