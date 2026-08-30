/**
 * Centralized Rate Limiter & Cooldown Middleware
 * Implements in-memory sliding window rate limiting with explicit TTL cleanup.
 */

const logger = require('../utils/logger');
const { createWarningEmbed } = require('../utils/embedFactory');

class RateLimiter {
  /**
   * @param {Object} options
   * @param {number} [options.cleanupIntervalMs=60000] - Interval to purge expired entries
   */
  constructor(options = {}) {
    this.hits = new Map();
    this.cleanupIntervalMs = options.cleanupIntervalMs || 60000;
    this.cleanupTimer = null;

    if (options.autoCleanup !== false) {
      this.startCleanupTimer();
    }
  }

  startCleanupTimer() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.cleanupIntervalMs);

    // Permit node to exit cleanly if this timer is active
    if (this.cleanupTimer && this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Consume a point from rate limit budget.
   * @param {string} key - Unique key identifier (e.g. `${guildId}:${userId}:${commandName}`)
   * @param {number} [maxPoints=1] - Maximum allowed executions in window
   * @param {number} [durationMs=3000] - Time window in milliseconds
   * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
   */
  consume(key, maxPoints = 1, durationMs = 3000) {
    if (!key || typeof key !== 'string') {
      throw new TypeError('RateLimiter key must be a non-empty string');
    }

    const now = Date.now();
    const entry = this.hits.get(key);

    if (!entry) {
      this.hits.set(key, {
        timestamps: [now],
        expiresAt: now + durationMs
      });
      return {
        allowed: true,
        remaining: Math.max(0, maxPoints - 1),
        retryAfterMs: 0
      };
    }

    // Filter out timestamps outside the sliding window
    const windowStart = now - durationMs;
    const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);

    if (validTimestamps.length >= maxPoints) {
      const oldestValid = validTimestamps[0];
      const retryAfterMs = Math.max(0, oldestValid + durationMs - now);

      entry.timestamps = validTimestamps;
      entry.expiresAt = now + retryAfterMs;

      return {
        allowed: false,
        remaining: 0,
        retryAfterMs
      };
    }

    validTimestamps.push(now);
    entry.timestamps = validTimestamps;
    entry.expiresAt = now + durationMs;

    return {
      allowed: true,
      remaining: Math.max(0, maxPoints - validTimestamps.length),
      retryAfterMs: 0
    };
  }

  /**
   * Check without consuming.
   * @param {string} key
   * @param {number} maxPoints
   * @param {number} durationMs
   */
  check(key, maxPoints = 1, durationMs = 3000) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry) {
      return { allowed: true, remaining: maxPoints, retryAfterMs: 0 };
    }

    const windowStart = now - durationMs;
    const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);

    if (validTimestamps.length >= maxPoints) {
      const oldestValid = validTimestamps[0];
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldestValid + durationMs - now)
      };
    }

    return {
      allowed: true,
      remaining: maxPoints - validTimestamps.length,
      retryAfterMs: 0
    };
  }

  reset(key) {
    return this.hits.delete(key);
  }

  clear() {
    this.hits.clear();
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this.hits.entries()) {
      if (entry.expiresAt <= now) {
        this.hits.delete(key);
      }
    }
  }

  get size() {
    return this.hits.size;
  }
}

// Global default rate limiter singleton
const globalRateLimiter = new RateLimiter();

/**
 * Helper to check cooldown for Discord Interactions
 * @param {import('discord.js').Interaction} interaction
 * @param {Object} options
 * @param {number} [options.durationMs=3000]
 * @param {number} [options.maxPoints=1]
 * @param {string} [options.commandName]
 * @returns {Promise<boolean>} true if allowed, false if blocked (and sends reply)
 */
async function checkInteractionCooldown(interaction, options = {}) {
  const durationMs = options.durationMs || 3000;
  const maxPoints = options.maxPoints || 1;
  const commandName = options.commandName || interaction.commandName || 'command';
  const userId = interaction.user?.id || 'unknown';
  const guildId = interaction.guild?.id || 'dm';

  const key = `${guildId}:${userId}:${commandName}`;
  const result = globalRateLimiter.consume(key, maxPoints, durationMs);

  if (!result.allowed) {
    const seconds = (result.retryAfterMs / 1000).toFixed(1);
    const warningEmbed = createWarningEmbed(
      '⏳ Espera un momento',
      `Estás usando </${commandName}:${interaction.commandId || '0'}> demasiado rápido.\nPor favor espera **${seconds}s** antes de volver a intentarlo.`
    );

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [warningEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [warningEmbed], ephemeral: true });
      }
    } catch (err) {
      logger.warn('[RateLimit] Error enviando respuesta de cooldown:', { error: err.message });
    }
    return false;
  }

  return true;
}

module.exports = {
  RateLimiter,
  globalRateLimiter,
  checkInteractionCooldown
};
