// Emoji de la moneda del servidor. Se configura con /coinicon y se guarda en config.coinEmoji.
// Si no hay emoji propio configurado se usa el unicode 🪙, así que nada se rompe sin configuración.
const DEFAULT_COIN = '🪙';
const CUSTOM_EMOJI_RE = /^<a?:[A-Za-z0-9_]{2,32}:\d{17,21}>$/;
const TTL_MS = 15 * 1000;

let cached = DEFAULT_COIN;
let cachedAt = 0;
let readConfigImpl = null;

function isValidCoinEmoji(value) {
  if (typeof value !== 'string') return false;
  if (CUSTOM_EMOJI_RE.test(value)) return true;
  // Unicode corto (un emoji, con posibles selectores/ZWJ): sin letras ni menciones.
  return value.length > 0 && value.length <= 16 && !/[A-Za-z0-9<>@#]/.test(value);
}

function loadConfig() {
  if (readConfigImpl) return readConfigImpl();
  return require('./configCache').readConfig();
}

/** Emoji actual de la moneda (con caché de 15 s para no leer disco en cada mensaje). */
function getCoinEmoji(now = Date.now()) {
  if (now - cachedAt > TTL_MS) {
    try {
      const value = loadConfig().coinEmoji;
      cached = isValidCoinEmoji(value) ? value : DEFAULT_COIN;
    } catch { cached = DEFAULT_COIN; }
    cachedAt = now;
  }
  return cached;
}

function invalidateCoinEmoji() { cachedAt = 0; }
function setConfigReaderForTests(fn) { readConfigImpl = fn; invalidateCoinEmoji(); }

const swap = (text, emoji) => (typeof text === 'string' && text.includes(DEFAULT_COIN) ? text.split(DEFAULT_COIN).join(emoji) : text);

function rewriteEmbedData(data, emoji) {
  if (!data || typeof data !== 'object') return data;
  const out = { ...data };
  for (const key of ['title', 'description']) if (key in out) out[key] = swap(out[key], emoji);
  if (out.author) out.author = { ...out.author, name: swap(out.author.name, emoji) };
  if (out.footer) out.footer = { ...out.footer, text: swap(out.footer.text, emoji) };
  if (Array.isArray(out.fields)) out.fields = out.fields.map(f => ({ ...f, name: swap(f.name, emoji), value: swap(f.value, emoji) }));
  return out;
}

function rewriteEmbed(embed, emoji) {
  if (embed && typeof embed.toJSON === 'function' && embed.data) {
    embed.data = rewriteEmbedData(embed.data, emoji); // EmbedBuilder: se actualiza en sitio
    return embed;
  }
  return rewriteEmbedData(embed, emoji);
}

/** Reemplaza 🪙 por el emoji propio en content y embeds de un payload de envío. */
function rewriteCoins(payload, emoji = getCoinEmoji()) {
  if (emoji === DEFAULT_COIN || payload == null) return payload;
  if (typeof payload === 'string') return swap(payload, emoji);
  if (typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const proto = Object.getPrototypeOf(payload);
  if (proto !== Object.prototype && proto !== null) return payload; // p. ej. MessagePayload: no se toca
  const out = { ...payload };
  if (typeof out.content === 'string') out.content = swap(out.content, emoji);
  if (Array.isArray(out.embeds)) out.embeds = out.embeds.map(e => rewriteEmbed(e, emoji));
  return out;
}

const METHODS = {
  User: ['send'], GuildMember: ['send', 'edit'], DMChannel: ['send'], ThreadChannel: ['send'],
  TextChannel: ['send'], NewsChannel: ['send'], VoiceChannel: ['send'], StageChannel: ['send'],
  Message: ['reply', 'edit'],
  CommandInteraction: ['reply', 'editReply', 'followUp'],
  MessageComponentInteraction: ['reply', 'editReply', 'followUp', 'update'],
  ModalSubmitInteraction: ['reply', 'editReply', 'followUp', 'update']
};
const PATCHED = Symbol.for('yujin.coinRewriter');

/** Envuelve (una sola vez) los métodos de envío de discord.js. Sin emoji propio no hace nada. */
function installCoinRewriter(discord = require('discord.js')) {
  let patched = 0;
  for (const [className, methods] of Object.entries(METHODS)) {
    const cls = discord[className];
    if (!cls?.prototype) continue;
    for (const method of methods) {
      let proto = cls.prototype;
      while (proto && !Object.prototype.hasOwnProperty.call(proto, method)) proto = Object.getPrototypeOf(proto);
      const original = proto?.[method];
      if (typeof original !== 'function' || original[PATCHED]) continue;
      const wrapped = function patchedSend(payload, ...rest) { return original.call(this, rewriteCoins(payload), ...rest); };
      wrapped[PATCHED] = true;
      Object.defineProperty(proto, method, { value: wrapped, writable: true, configurable: true });
      patched += 1;
    }
  }
  return patched;
}

module.exports = {
  DEFAULT_COIN, isValidCoinEmoji, getCoinEmoji, invalidateCoinEmoji, rewriteCoins, installCoinRewriter, setConfigReaderForTests
};
