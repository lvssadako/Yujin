const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  author: 256,
  total: 6000,
  fields: 25,
  embedsPerMessage: 10,
};

// Paginaciones activas con TTL y limpieza explícita (evita global sin control).
const activePaginations = new Map();

function clearPaginations() {
  for (const [, entry] of activePaginations) {
    try {
      if (entry?.timeout) clearTimeout(entry.timeout);
    } catch {
      // Ignorar errores de limpieza
    }
  }
  activePaginations.clear();
}

function truncate(str, max) {
  if (typeof str !== 'string') return '';
  if (str.length <= max) return str;
  if (max <= 1) return str.slice(0, max);
  return str.slice(0, max - 1) + '…';
}

function splitTextEquitably(text, max = LIMITS.description) {
  if (typeof text !== 'string' || text.length === 0) return [''];
  const limit = Number.isInteger(max) && max > 0 ? max : LIMITS.description;
  if (text.length <= limit) return [text];

  const total = text.length;
  const partsCount = Math.ceil(total / limit);
  const parts = [];
  let start = 0;

  for (let i = 0; i < partsCount; i += 1) {
    if (i === partsCount - 1) {
      parts.push(text.slice(start));
      break;
    }
    const remaining = total - start;
    const remainingParts = partsCount - i;
    const target = Math.ceil(remaining / remainingParts);
    let cut = start + target;

    // No superar el límite duro de Discord
    if (cut - start > limit) cut = start + limit;
    if (cut >= total) {
      parts.push(text.slice(start));
      break;
    }

    // Buscar corte limpio hacia atrás (salto de línea, luego espacio)
    const windowStart = Math.max(start + 1, cut - 300);
    let breakIdx = text.lastIndexOf('\n', cut);
    if (breakIdx < windowStart) breakIdx = -1;
    if (breakIdx >= 0) {
      cut = breakIdx + 1;
    } else {
      let spaceIdx = text.lastIndexOf(' ', cut);
      if (spaceIdx < windowStart) spaceIdx = text.lastIndexOf('\u3000', cut);
      if (spaceIdx >= windowStart) {
        cut = spaceIdx + 1;
      } else {
        cut = start + target;
        if (cut - start > limit) cut = start + limit;
      }
    }

    if (cut <= start) cut = start + Math.min(target, limit);
    parts.push(text.slice(start, cut));
    start = cut;
  }

  return parts.filter((p, idx) => p.length > 0 || idx === 0);
}

const COLORS = {
  primary: 0x5865f2,    // Blurple
  blurple: 0x5865f2,    // Blurple
  success: 0x2ecc71,    // Green
  error: 0xe74c3c,      // Red
  info: 0x3498db,       // Blue
  warning: 0xf39c12,    // Orange
  boost: 0xf47fff,      // Pink/Magenta
  level: 0x9b59b6,      // Purple
  economy: 0xf1c40f,    // Gold
  neutral: 0x34495e,    // Dark gray
};

function toSafeString(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function applyTitle(embed, title) {
  const safe = truncate(toSafeString(title, ''), LIMITS.title);
  if (safe) embed.setTitle(safe);
  return embed;
}

function applyDescription(embed, description) {
  const safe = truncate(toSafeString(description, ''), LIMITS.description);
  if (safe) embed.setDescription(safe);
  return embed;
}

function applyAuthor(embed, user) {
  if (!user || typeof user.username !== 'string' || user.username.length === 0) return embed;
  const data = { name: truncate(user.username, LIMITS.author) };
  try {
    const icon = user.displayAvatarURL?.({ dynamic: true });
    if (typeof icon === 'string' && icon.length > 0) data.iconURL = icon;
  } catch {
    // Sin avatar: mantener solo nombre
  }
  embed.setAuthor(data);
  return embed;
}

function createSuccessEmbed(title = 'Éxito', description = '') {
  const embed = new EmbedBuilder().setColor(COLORS.success).setTimestamp();
  applyTitle(embed, title);
  applyDescription(embed, description);
  return embed;
}

function createErrorEmbed(title = 'Error', description = '') {
  const embed = new EmbedBuilder().setColor(COLORS.error).setTimestamp();
  applyTitle(embed, title);
  applyDescription(embed, description);
  return embed;
}

function createInfoEmbed(title = 'Información', description = '') {
  const embed = new EmbedBuilder().setColor(COLORS.info).setTimestamp();
  applyTitle(embed, title);
  applyDescription(embed, description);
  return embed;
}

function createWarningEmbed(title = 'Advertencia', description = '') {
  const embed = new EmbedBuilder().setColor(COLORS.warning).setTimestamp();
  applyTitle(embed, title);
  applyDescription(embed, description);
  return embed;
}

function createBoostEmbed(user = null, description = '') {
  const embed = new EmbedBuilder()
    .setColor(COLORS.boost)
    .setTimestamp();

  applyDescription(embed, description);
  applyAuthor(embed, user);

  return embed;
}

function createLevelEmbed(user = null, level = 0, description = '') {
  const lvl = Number.isFinite(Number(level)) ? Number(level) : 0;
  const fallback = `:tada: <@${user?.id}> subió al nivel **${lvl}**!`;
  const embed = new EmbedBuilder()
    .setColor(COLORS.level)
    .setTimestamp();

  applyDescription(embed, description || fallback);
  applyAuthor(embed, user);

  return embed;
}

function createEconomyEmbed(title = 'Economía', description = '', user = null) {
  const embed = new EmbedBuilder().setColor(COLORS.economy).setTimestamp();
  applyTitle(embed, title);
  applyDescription(embed, description);
  applyAuthor(embed, user);
  return embed;
}

function createNeutralEmbed(title = '', description = '') {
  const embed = new EmbedBuilder().setColor(COLORS.neutral).setTimestamp();
  applyTitle(embed, title);
  applyDescription(embed, description);
  return embed;
}

function getEmbedLength(embedData) {
  const d = embedData?.data ?? embedData ?? {};
  let total = 0;
  if (typeof d.title === 'string') total += d.title.length;
  if (typeof d.description === 'string') total += d.description.length;
  if (typeof d.footer?.text === 'string') total += d.footer.text.length;
  if (typeof d.author?.name === 'string') total += d.author.name.length;
  if (Array.isArray(d.fields)) {
    for (const f of d.fields) {
      if (typeof f?.name === 'string') total += f.name.length;
      if (typeof f?.value === 'string') total += f.value.length;
    }
  }
  return total;
}

function buildPaginatedEmbeds(options = {}) {
  const {
    title = '',
    description = '',
    fields = [],
    color = COLORS.info,
    footer = '',
    author = null,
    timestamp = true,
    titleSuffix = true,
  } = options ?? {};

  const safeTitle = typeof title === 'string' ? title : String(title ?? '');
  const safeDesc = typeof description === 'string' ? description : String(description ?? '');
  const safeFooter = typeof footer === 'string' ? footer : '';
  const safeFields = Array.isArray(fields) ? fields : [];

  const descParts = splitTextEquitably(safeDesc || '', LIMITS.description);
  const pages = Math.max(descParts.length, 1);

  const embeds = [];
  for (let i = 0; i < pages; i += 1) {
    const embed = new EmbedBuilder().setColor(color);
    const pageSuffix = pages > 1 && titleSuffix ? ` (${i + 1}/${pages})` : '';
    const baseTitle = truncate(safeTitle, Math.max(1, LIMITS.title - pageSuffix.length));
    if (baseTitle || pageSuffix) embed.setTitle(`${baseTitle}${pageSuffix}`);

    const part = descParts[i] ?? '';
    if (part) embed.setDescription(part);

    if (author && typeof author.name === 'string' && author.name.length > 0) {
      const authorData = { name: truncate(author.name, LIMITS.author) };
      if (typeof author.iconURL === 'string' && author.iconURL.length > 0) authorData.iconURL = author.iconURL;
      if (typeof author.url === 'string' && author.url.length > 0) authorData.url = author.url;
      embed.setAuthor(authorData);
    }

    const pageFooter = pages > 1 ? `Página ${i + 1}/${pages}${safeFooter ? ` • ${safeFooter}` : ''}` : safeFooter;
    if (pageFooter) embed.setFooter({ text: truncate(pageFooter, LIMITS.footer) });
    if (timestamp) embed.setTimestamp();
    embeds.push(embed);
  }

  // Si hay fields, se distribuyen después de forma equitativa (se amplía en siguiente ciclo)
  if (safeFields.length > 0) {
    const normalized = safeFields.map((f) => ({
      name: truncate(typeof f?.name === 'string' ? f.name : String(f?.name ?? ''), LIMITS.fieldName) || '­',
      value: truncate(typeof f?.value === 'string' ? f.value : String(f?.value ?? ''), LIMITS.fieldValue) || '­',
      inline: Boolean(f?.inline),
    }));
    // Distribución equitativa por peso para respetar total 6000 y 25 fields
    const withFields = distributeFieldsEquitably(embeds, normalized);
    return withFields.slice(0, LIMITS.embedsPerMessage);
  }

  return embeds.slice(0, LIMITS.embedsPerMessage);
}

function distributeFieldsEquitably(embeds, fields) {
  const pages = embeds.map((e) => ({ embed: e, weight: getEmbedLength(e), count: e.data.fields?.length ?? 0 }));
  // Pre-calcular páginas necesarias para reparto equitativo (no llenado secuencial)
  const totalFieldsWeight = fields.reduce((acc, f) => acc + (f.name?.length ?? 0) + (f.value?.length ?? 0), 0);
  const neededByWeight = Math.ceil((totalFieldsWeight + pages.reduce((a, p) => a + p.weight, 0)) / LIMITS.total);
  const neededByCount = Math.ceil((fields.length + pages.reduce((a, p) => a + p.count, 0)) / LIMITS.fields);
  const needed = Math.min(LIMITS.embedsPerMessage, Math.max(pages.length, neededByWeight, neededByCount, Math.ceil(fields.length / LIMITS.fields)));
  while (pages.length < needed) {
    const base = pages[0]?.embed;
    const fresh = base ? EmbedBuilder.from(base).setFields([]) : new EmbedBuilder();
    if (fresh.data.description !== undefined) delete fresh.data.description;
    // Contar peso base real para equilibrar (título provisional se re-etiqueta después)
    pages.push({ embed: fresh, weight: getEmbedLength(fresh), count: 0 });
  }
  // Ordenar fields por peso descendente para mejor reparto (greedy equilibrado)
  const sorted = [...fields].sort((a, b) => ((b.name?.length ?? 0) + (b.value?.length ?? 0)) - ((a.name?.length ?? 0) + (a.value?.length ?? 0)));
  for (const field of sorted) {
    // Elegir página con menor peso que aún tenga hueco y no supere total
    let best = null;
    for (const p of pages) {
      if (p.count >= LIMITS.fields) continue;
      const add = (field.name?.length ?? 0) + (field.value?.length ?? 0);
      if (p.weight + add > LIMITS.total) continue;
      if (!best || p.weight < best.weight) best = p;
    }
    // Si ninguna cabe por total, crear nueva página heredando estilo base
    if (!best) {
      if (pages.length >= LIMITS.embedsPerMessage) {
        // Sin hueco: compactar en la más liviana aunque roce el límite (truncado ya aplicado)
        best = pages.reduce((a, b) => (a.weight <= b.weight ? a : b));
        if (best.count >= LIMITS.fields) continue;
      } else {
        const base = pages[0]?.embed;
        const fresh = base ? EmbedBuilder.from(base).setFields([]) : new EmbedBuilder();
        // Limpiar descripción en páginas extra de fields para no duplicar (evitar setDescription('') que rechaza Discord)
        if (fresh.data.description !== undefined) delete fresh.data.description;
        best = { embed: fresh, weight: getEmbedLength(fresh), count: 0 };
        pages.push(best);
      }
    }
    best.embed.addFields(field);
    best.weight += (field.name?.length ?? 0) + (field.value?.length ?? 0);
    best.count += 1;
  }
  // Re-etiquetar títulos/footers si creció el número de páginas
  if (pages.length !== embeds.length) {
    pages.forEach((p, idx) => {
      const d = p.embed.data;
      if (d.title) {
        const clean = String(d.title).replace(/\s*\(\d+\/\d+\)\s*$/, '');
        p.embed.setTitle(truncate(clean, LIMITS.title - ` (${idx + 1}/${pages.length})`.length) + ` (${idx + 1}/${pages.length})`);
      }
      const footerText = d.footer?.text ? String(d.footer.text).replace(/^Página \d+\/\d+( • )?/, '') : '';
      const newFooter = `Página ${idx + 1}/${pages.length}${footerText ? ` • ${footerText}` : ''}`;
      p.embed.setFooter({ text: truncate(newFooter, LIMITS.footer) });
    });
  }
  return pages.map((p) => p.embed);
}

function isInteractionTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (typeof target.isChatInputCommand === 'function') {
    try {
      if (target.isChatInputCommand()) return true;
    } catch {
      // Continuar con heurística
    }
  }
  // Heurística dual slash/prefix: interaction tiene user, message tiene author
  if (target.user && !target.author && typeof target.reply === 'function') return true;
  return false;
}

function getInvokerId(target) {
  if (!target || typeof target !== 'object') return null;
  if (typeof target.user?.id === 'string') return target.user.id;
  if (typeof target.author?.id === 'string') return target.author.id;
  return null;
}

function getGuildId(target) {
  if (!target || typeof target !== 'object') return 'dm';
  if (typeof target.guildId === 'string') return target.guildId;
  if (typeof target.guild?.id === 'string') return target.guild.id;
  return 'dm';
}

function buildNavRow(page, total, disabled = false) {
  const prev = new ButtonBuilder()
    .setCustomId('embed_prev')
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || page <= 0);
  const next = new ButtonBuilder()
    .setCustomId('embed_next')
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled || page >= total - 1);
  return new ActionRowBuilder().addComponents(prev, next);
}

async function sendPaginatedEmbeds(target, embeds, options = {}) {
  if (!target || typeof target !== 'object') throw new TypeError('target inválido');
  if (!Array.isArray(embeds) || embeds.length === 0) throw new TypeError('embeds debe ser un array no vacío');

  const {
    enableButtons = true,
    timeoutMs = 60000,
    ephemeral = false,
  } = options ?? {};

  const safeTimeout = Number.isFinite(Number(timeoutMs))
    ? Math.min(300000, Math.max(0, Number(timeoutMs)))
    : 60000;
  const list = embeds.slice(0, LIMITS.embedsPerMessage);
  const isInteraction = isInteractionTarget(target);

  // Caso simple: 1 embed, sin botones (paridad slash/prefix)
  if (list.length === 1 || enableButtons === false) {
    const payload = { embeds: list };
    if (isInteraction && ephemeral) payload.ephemeral = true;
    try {
      if (isInteraction) {
        if (target.deferred || target.replied) return await target.followUp(payload);
        return await target.reply(payload);
      }
      if (typeof target.reply === 'function') {
        try {
          return await target.reply(payload);
        } catch {
          return await target.channel?.send(payload);
        }
      }
      return await target.channel?.send(payload);
    } catch {
      throw new Error('No se pudo mostrar el contenido. Inténtalo de nuevo.');
    }
  }

  let page = 0;
  const row = buildNavRow(page, list.length);
  const payload = { embeds: [list[page]], components: [row] };
  if (isInteraction && ephemeral) payload.ephemeral = true;

  let sent;
  try {
    if (isInteraction) {
      if (target.deferred || target.replied) sent = await target.followUp(payload);
      else sent = await target.reply(payload);
      // reply() en interactions devuelve void en versiones reales; recuperar vía fetchReply
      if (!sent?.createMessageComponentCollector && typeof target.fetchReply === 'function') {
        try {
          sent = await target.fetchReply();
        } catch {
          // Mantener sent original
        }
      }
    } else if (typeof target.reply === 'function') {
      try {
        sent = await target.reply(payload);
      } catch {
        sent = await target.channel?.send(payload);
      }
    } else {
      sent = await target.channel?.send(payload);
    }
  } catch {
    throw new Error('No se pudo mostrar la lista paginada. Inténtalo de nuevo.');
  }

  // Sin soporte de collector (mocks/tests): devolver con botones igualmente
  const canCollect = sent && typeof sent.createMessageComponentCollector === 'function';
  if (!canCollect || safeTimeout <= 0) {
    return sent;
  }

  const invokerId = getInvokerId(target);
  const guildId = getGuildId(target);
  const key = `${guildId}:${invokerId ?? 'anon'}:${Date.now()}:${Math.floor(Math.random() * 1e6)}`;
  const collector = sent.createMessageComponentCollector({
    filter: (i) => (invokerId ? i.user?.id === invokerId : true),
    time: safeTimeout,
  });

  const entry = { collector, expires: Date.now() + safeTimeout, timeout: null };
  entry.timeout = setTimeout(() => {
    activePaginations.delete(key);
  }, safeTimeout + 5000);
  if (typeof entry.timeout.unref === 'function') entry.timeout.unref();
  activePaginations.set(key, entry);

  collector.on('collect', async (i) => {
    try {
      if (i.customId === 'embed_prev') page = (page - 1 + list.length) % list.length;
      else if (i.customId === 'embed_next') page = (page + 1) % list.length;
      else return;
      await i.update({ embeds: [list[page]], components: [buildNavRow(page, list.length)] });
    } catch {
      // Mensaje claro sin exponer internos
    }
  });

  collector.on('end', async () => {
    activePaginations.delete(key);
    if (entry.timeout) clearTimeout(entry.timeout);
    try {
      const disabled = buildNavRow(page, list.length, true);
      if (typeof sent.edit === 'function') await sent.edit({ embeds: [list[page]], components: [disabled] });
      else if (isInteraction && typeof target.editReply === 'function') {
        await target.editReply({ embeds: [list[page]], components: [disabled] });
      }
    } catch {
      // Silenciar errores de limpieza
    }
  });

  return sent;
}

module.exports = {
  COLORS,
  LIMITS,
  truncate,
  splitTextEquitably,
  getEmbedLength,
  buildPaginatedEmbeds,
  distributeFieldsEquitably,
  sendPaginatedEmbeds,
  clearPaginations,
  _activePaginations: activePaginations,
  createSuccessEmbed,
  createErrorEmbed,
  createInfoEmbed,
  createWarningEmbed,
  createBoostEmbed,
  createLevelEmbed,
  createEconomyEmbed,
  createNeutralEmbed,
};
