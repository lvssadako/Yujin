const { formatNumber, progressBar } = require('./ui');

// Piezas visuales comunes de los comandos de economía. El 🪙 se sustituye por el emoji propio de la moneda al enviar.
const money = n => `**${formatNumber(n)}** 🪙`;
const relativeTime = ms => `<t:${Math.floor(ms / 1000)}:R>`;

/** Añade al embed el avatar del usuario (autor y miniatura) si está disponible. */
function withActor(embed, user, label) {
  const icon = typeof user?.displayAvatarURL === 'function' ? user.displayAvatarURL() : null;
  if (icon) { embed.setThumbnail(icon); embed.setAuthor({ name: label, iconURL: icon }); }
  else embed.setAuthor({ name: label });
  return embed;
}

/** "1,200 → 800": cómo cambió una cifra. */
const moved = (before, after) => `${formatNumber(before)} → **${formatNumber(after)}** 🪙`;

/** Billetera / Banco / Total como tres campos en línea. */
function balanceFields(balance) {
  const coins = Number(balance?.coins) || 0; const bank = Number(balance?.bank) || 0;
  return [
    { name: '👛 Billetera', value: money(coins), inline: true },
    { name: '🏦 Banco', value: money(bank), inline: true },
    { name: '💰 Total', value: money(coins + bank), inline: true }
  ];
}

/** Barra de "dinero a salvo": qué parte del total está en el banco (a salvo de robos). */
function safeBar(balance) {
  const coins = Number(balance?.coins) || 0; const bank = Number(balance?.bank) || 0;
  const total = coins + bank;
  return total > 0 ? progressBar(bank, total) : progressBar(0, 1);
}

function cooldownField(label, readyAtMs) {
  return { name: `⏰ ${label}`, value: relativeTime(readyAtMs), inline: true };
}

module.exports = { money, relativeTime, withActor, moved, balanceFields, safeBar, cooldownField };
