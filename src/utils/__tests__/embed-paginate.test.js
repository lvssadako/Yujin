const test = require('node:test');
const assert = require('node:assert/strict');

const { splitTextEquitably, buildPaginatedEmbeds, LIMITS } = require('../embedFactory');

test('splitTextEquitably divide descripción larga en partes equilibradas', () => {
  const text = 'a'.repeat(9000);
  const parts = splitTextEquitably(text, 4096);
  assert.equal(parts.length, 3);
  // Equitativo: ninguna parte diminuta (todas > 2000 en este caso)
  for (const p of parts) {
    assert.ok(p.length <= 4096, `parte supera límite: ${p.length}`);
    assert.ok(p.length >= 2000, `parte no equitativa, muy pequeña: ${p.length}`);
  }
  assert.equal(parts.join('').length, 9000);
});

test('buildPaginatedEmbeds reparte descripción larga en embeds equilibrados', () => {
  const description = 'Línea de prueba para paginado equitativo.\n'.repeat(400);
  const embeds = buildPaginatedEmbeds({ title: 'Ranking', description, color: 0x3498db });
  assert.ok(embeds.length > 1, 'debería paginar');
  assert.ok(embeds.length <= LIMITS.embedsPerMessage);
  const lens = embeds.map((e) => e.data.description?.length ?? 0);
  for (const len of lens) assert.ok(len <= LIMITS.description);
  // Equitativo: diferencia entre mayor y menor < 35% del mayor
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  assert.ok((max - min) / max < 0.35, `reparto no equitativo: ${lens.join(',')}`);
  // Título con paginación
  assert.match(embeds[0].data.title, /\(1\/\d+\)/);
});

test('buildPaginatedEmbeds distribuye fields equitativamente sin superar 6000', () => {
  const fields = Array.from({ length: 30 }, (_, i) => ({
    name: `Campo ${i + 1}`,
    value: 'x'.repeat(800),
    inline: false,
  }));
  const embeds = buildPaginatedEmbeds({ title: 'Lista', description: 'Intro', fields });
  assert.ok(embeds.length > 1);
  for (const e of embeds) {
    assert.ok((e.data.fields?.length ?? 0) <= 25);
    const { getEmbedLength } = require('../embedFactory');
    assert.ok(getEmbedLength(e) <= 6000, `supera total 6000: ${getEmbedLength(e)}`);
  }
  const counts = embeds.map((e) => e.data.fields?.length ?? 0);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  assert.ok(max - min <= 2, `reparto fields no equitativo: ${counts.join(',')}`);
  const totalFields = counts.reduce((a, b) => a + b, 0);
  assert.equal(totalFields, 30);
});

test('create*Embed trunca seguro sin lanzar error de Discord', () => {
  const { createInfoEmbed, createSuccessEmbed } = require('../embedFactory');
  const longTitle = 'T'.repeat(500);
  const longDesc = 'D'.repeat(8000);
  const e1 = createInfoEmbed(longTitle, longDesc);
  assert.ok(e1.data.title.length <= LIMITS.title);
  assert.ok(e1.data.description.length <= LIMITS.description);
  const e2 = createSuccessEmbed(longTitle, 'ok');
  assert.ok(e2.data.title.length <= LIMITS.title);
});

test('sendPaginatedEmbeds responde 1 embed sin botones y varios con botones', async () => {
  const { buildPaginatedEmbeds, sendPaginatedEmbeds } = require('../embedFactory');
  const single = buildPaginatedEmbeds({ title: 'Solo', description: 'corto' });

  let replied = null;
  const mockMessageTarget = {
    author: { id: 'u1' },
    guild: { id: 'g1' },
    reply: async (payload) => { replied = payload; return { id: 'm1' }; },
    channel: { send: async (payload) => { replied = payload; return { id: 'm1' }; } },
  };
  await sendPaginatedEmbeds(mockMessageTarget, single, { enableButtons: false, timeoutMs: 10 });
  assert.ok(replied);
  assert.equal(replied.embeds.length, 1);
  assert.ok(!replied.components, 'no debe incluir botones con 1 embed');

  const many = buildPaginatedEmbeds({ title: 'Mucho', description: 'x'.repeat(9000) });
  assert.ok(many.length > 1);
  let repliedMany = null;
  const mockSlashTarget = {
    user: { id: 'u2' },
    guildId: 'g1',
    guild: { id: 'g1' },
    replied: false,
    deferred: false,
    reply: async (payload) => { repliedMany = payload; return { createMessageComponentCollector: () => ({ on: () => {}, stop: () => {} }) }; },
  };
  // Mock mínimo: sendPaginatedEmbeds debe detectar interaction por user + reply
  await sendPaginatedEmbeds(mockSlashTarget, many, { enableButtons: true, timeoutMs: 10 });
  assert.ok(repliedMany);
  assert.ok(repliedMany.embeds.length >= 1);
  assert.ok(Array.isArray(repliedMany.components) && repliedMany.components.length === 1, 'debe incluir fila de botones');
});
