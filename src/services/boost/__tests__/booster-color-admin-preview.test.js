const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const servicePath = path.join(__dirname, '..', 'boosterColorService.js');

function loadServiceWithConfig(config) {
  const source = fs.readFileSync(servicePath, 'utf8');
  const sourceRequire = createRequire(servicePath);
  const virtualFs = {
    existsSync: candidate => path.basename(candidate) === 'data' || path.basename(candidate) === 'boosterColors.json',
    mkdirSync() {},
    readFileSync(candidate, encoding) {
      assert.equal(path.basename(candidate), 'boosterColors.json', 'solo se permite leer el fixture en memoria');
      const data = JSON.stringify({ guild_fixture: config });
      return encoding ? data : Buffer.from(data);
    },
    writeFileSync() { assert.fail('La prueba de presentación no debe escribir almacenamiento'); },
    renameSync() { assert.fail('La prueba de presentación no debe renombrar archivos'); },
  };
  const logger = { warn() {}, error() {}, info() {} };
  const mockedRequire = id => {
    if (id === 'fs') return virtualFs;
    if (id === '../../utils/logger') return logger;
    return sourceRequire(id);
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    require: mockedRequire,
    module,
    exports: module.exports,
    __dirname: path.dirname(servicePath),
    __filename: servicePath,
    URL,
    Buffer,
    console,
  }, { filename: servicePath });
  return module.exports;
}

test('el panel administrativo muestra una vista previa del texto público', () => {
  const description = 'Texto para miembros: elige tu color desde el menú.';
  const footer = 'Yujin Bot • Beneficios exclusivos';
  const service = loadServiceWithConfig({
    title: 'Colores para Boosters',
    description,
    footer,
    bannerUrl: '',
    colors: [],
    sentMessages: [],
  });

  const embeds = service.buildAdminEmbeds('guild_fixture', { name: 'Comunidad' });
  const fields = embeds.flatMap(embed => embed.data.fields ?? []);
  assert.equal(embeds[0].data.title, '🎨 Colores Booster');
  assert.equal(embeds[0].data.author.name, 'Comunidad');
  assert.equal(embeds[0].data.description, '**0/24 colores** · **0 embeds publicados**');
  const descriptionPreview = fields.find(field => field.name === '📖 Descripción pública');
  const footerPreview = fields.find(field => field.name === '🪶 Pie público');

  assert.equal(descriptionPreview?.value, description);
  assert.equal(footerPreview?.value, footer);
  assert.ok(fields.some(field => field.name === '📝 Título público'));
  assert.ok(fields.some(field => field.name === '🖼️ Banner'));
  assert.ok(embeds.every(embed => (embed.data.fields ?? []).every(field => field.value.length <= 1024)));
});

test('las vistas previas limitan textos largos al tamaño configurado', () => {
  const service = loadServiceWithConfig({
    title: 'Colores',
    description: 'D'.repeat(4000),
    footer: 'F'.repeat(2000),
    bannerUrl: '',
    colors: [],
    sentMessages: [],
  });

  const fields = service.buildAdminEmbeds('guild_fixture', null).flatMap(embed => embed.data.fields ?? []);
  const descriptionPreview = fields.find(field => field.name === '📖 Descripción pública');
  const footerPreview = fields.find(field => field.name === '🪶 Pie público');

  assert.equal(descriptionPreview?.value.length, 900);
  assert.equal(footerPreview?.value.length, 900);
  assert.ok(fields.every(field => field.value.length <= 1024));
});

test('los bloques de la lista administrativa conservan un encabezado simple', () => {
  const colors = Array.from({ length: 24 }, (_, index) => ({
    id: 'color_' + index,
    name: 'ColorExtremadamenteLargoParaForzarVariosBloques_' + (index + 1),
    roleId: '1234567890123456' + String(index).padStart(2, '0'),
    emoji: '🎨',
  }));
  const service = loadServiceWithConfig({
    title: 'Colores para Boosters',
    description: 'Descripción pública',
    footer: 'Pie público',
    bannerUrl: '',
    colors,
    sentMessages: [],
  });

  const embeds = service.buildAdminEmbeds('guild_fixture', null);
  const colorFields = embeds.flatMap(embed => embed.data.fields ?? [])
    .filter(field => field.name === '🎨 Colores' || field.name === '↳ Continuación');

  assert.ok(colorFields.length > 1, 'el fixture debe distribuir la lista en varios bloques');
  assert.ok(colorFields.some(field => field.name === '🎨 Colores'));
  assert.ok(colorFields.some(field => field.name === '↳ Continuación'));
  assert.ok(colorFields.every(field => !/\(\d+\/\d+\)/.test(field.name)));
  const rendered = colorFields.map(field => field.value).join('\n');
  for (let index = 1; index <= 24; index += 1) {
    assert.ok(rendered.includes('ColorExtremadamenteLargoParaForzarVariosBloques_' + index));
    const roleId = '1234567890123456' + String(index - 1).padStart(2, '0');
    assert.ok(rendered.includes('<@&' + roleId + '>'));
  }
});
