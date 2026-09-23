const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const storePath = path.join(__dirname, '..', '..', '..', '..', 'data', 'boosterColors.json');

function withIsolatedStore(t, guildId, colors) {
  const hadFile = fs.existsSync(storePath);
  const backup = hadFile ? fs.readFileSync(storePath) : null;
  const svc = require('../../boost/boosterColorService');
  const all = hadFile ? JSON.parse(backup.toString('utf8')) : {};
  all[guildId] = {
    title: 'Título de prueba para paginado',
    description: 'Descripción de prueba.',
    footer: 'Footer de prueba',
    bannerUrl: '',
    colors,
    sentMessages: [],
  };
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(all, null, 2), 'utf8');
  t.after(() => {
    if (backup === null) {
      const current = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      delete current[guildId];
      fs.writeFileSync(storePath, JSON.stringify(current, null, 2), 'utf8');
    } else {
      fs.writeFileSync(storePath, backup);
    }
  });
  return svc;
}

function twentyFourColors() {
  return Array.from({ length: 24 }, (_, i) => ({
    id: `color_test_${i}`,
    name: `NombreDeColorBastanteLargoParaProbarLimites_${i + 1}`,
    roleId: `123456789012345${String(i).padStart(2, '0')}`,
    emoji: '🌸',
  }));
}

test('buildPublicEmbeds reparte 24 colores sin corte abrupto', (t) => {
  const svc = withIsolatedStore(t, 'guild_paginate_pub', twentyFourColors());
  const embeds = svc.buildPublicEmbeds('guild_paginate_pub', null);
  assert.ok(embeds.length >= 1 && embeds.length <= 10, `embeds fuera de rango: ${embeds.length}`);
  let totalChars = 0;
  for (const e of embeds) {
    for (const f of e.data.fields ?? []) {
      assert.ok((f.value?.length ?? 0) <= 1024, `field supera 1024: ${f.value?.length}`);
      assert.ok(!f.value?.endsWith('...'), 'corte abrupto con ... en lista pública');
      totalChars += f.value?.length ?? 0;
    }
  }
  // Toda la lista debe estar presente (ningún color perdido por el slice)
  const joined = embeds.map((e) => (e.data.fields ?? []).map((f) => f.value).join('\n')).join('\n');
  for (let i = 1; i <= 24; i += 1) {
    assert.ok(joined.includes(`Limites_${i}`), `color ${i} perdido en el paginado`);
  }
  assert.ok(totalChars > 1024, 'el fixture debe superar un solo field para probar el reparto');
});

test('buildAdminEmbeds reparte 24 colores sin corte abrupto', (t) => {
  const svc = withIsolatedStore(t, 'guild_paginate_admin', twentyFourColors());
  const embeds = svc.buildAdminEmbeds('guild_paginate_admin', null);
  assert.ok(embeds.length >= 1 && embeds.length <= 10);
  const joined = embeds.map((e) => (e.data.fields ?? []).map((f) => f.value).join('\n')).join('\n');
  for (const f of embeds.flatMap((e) => e.data.fields ?? [])) {
    assert.ok((f.value?.length ?? 0) <= 1024);
    assert.ok(!f.value?.endsWith('...'), 'corte abrupto con ... en panel admin');
  }
  for (let i = 1; i <= 24; i += 1) {
    assert.ok(joined.includes(`Limites_${i}`), `color ${i} perdido en el panel`);
  }
});
