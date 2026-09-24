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
  let storeContents = JSON.stringify({ guild_fixture: config });
  const pendingWrites = new Map();
  const virtualFs = {
    existsSync(candidate) {
      const name = path.basename(candidate);
      return name === 'data' || name === 'boosterColors.json' || pendingWrites.has(candidate);
    },
    mkdirSync() {},
    readFileSync(candidate, encoding) {
      const stored = path.basename(candidate) === 'boosterColors.json' ? storeContents : pendingWrites.get(candidate);
      assert.equal(typeof stored, 'string', 'solo se permite leer el fixture en memoria');
      return encoding ? stored : Buffer.from(stored);
    },
    writeFileSync(candidate, value) {
      assert.equal(path.basename(candidate), 'boosterColors.json.tmp', 'las escrituras deben quedarse en el almacenamiento virtual');
      pendingWrites.set(candidate, String(value));
    },
    renameSync(sourcePath, destinationPath) {
      assert.equal(path.basename(destinationPath), 'boosterColors.json');
      assert.ok(pendingWrites.has(sourcePath), 'el temporal debe escribirse antes del rename');
      storeContents = pendingWrites.get(sourcePath);
      pendingWrites.delete(sourcePath);
    },
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
  const publicRendered = service.buildPublicEmbeds('guild_fixture', null)
    .flatMap(embed => embed.data.fields ?? [])
    .filter(field => field.name.includes('Colores Disponibles'))
    .map(field => field.value)
    .join('\n');
  assert.ok(publicRendered.length > 0, 'la prueba debe inspeccionar el contenido público');
  for (let index = 1; index <= 24; index += 1) {
    assert.ok(rendered.includes('ColorExtremadamenteLargoParaForzarVariosBloques_' + index));
    const roleId = '1234567890123456' + String(index - 1).padStart(2, '0');
    assert.ok(!rendered.includes('<@&' + roleId + '>'));
    assert.ok(!publicRendered.includes('<@&' + roleId + '>'));
    assert.equal(service.getConfig('guild_fixture').colors[index - 1].roleId, roleId);
  }
});

test('el panel organiza las acciones en menús de gestión y publicación', () => {
  const service = loadServiceWithConfig({
    title: 'Colores', description: 'Descripción', footer: 'Pie', bannerUrl: '',
    colors: [{ id: 'color_a', name: 'Azul', roleId: '12345678901234567', emoji: '🔹' }],
    sentMessages: [{ channelId: 'channel_a', messageId: 'message_a' }],
  });
  const rows = service.buildAdminComponents('guild_fixture');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.components.length === 1));
  const [managementMenu, publicationMenu] = rows.map(row => row.components[0]);
  assert.equal(managementMenu.data.custom_id, 'booster_color_panel_manage_select');
  assert.equal(publicationMenu.data.custom_id, 'booster_color_panel_publish_select');
  const managementValues = managementMenu.options.map(option => option.data.value).join("|");
  const publicationValues = publicationMenu.options.map(option => option.data.value).join("|");
  assert.equal(managementValues, 'booster_color_panel_add|booster_color_panel_remove|booster_color_panel_clear_all');
  assert.equal(publicationValues, 'booster_color_panel_edit_text|booster_color_panel_preview|booster_color_panel_send_btn|booster_color_panel_sync');
});

test('el menú de diseño permite editar título, descripción, pie y banner', async () => {
  const initial = { title: 'Antes', description: 'Texto anterior', footer: 'Pie anterior', bannerUrl: '', colors: [], sentMessages: [] };
  const service = loadServiceWithConfig(initial);
  const guild = { id: 'guild_fixture', name: 'Comunidad' };
  const member = { permissions: { has: () => true } };
  let modal;
  await service.handleInteraction({
    customId: 'booster_color_panel_publish_select',
    values: ['booster_color_panel_edit_text'],
    guild, member,
    isButton: () => false,
    showModal: async value => { modal = value; },
  });
  assert.equal(modal.data.custom_id, 'booster_color_modal_edit_text');
  const inputIds = modal.components.map(row => row.components[0].data.custom_id).join("|");
  assert.equal(inputIds, 'embed_title|embed_desc|embed_footer|embed_banner');
  const values = {
    embed_title: 'Después',
    embed_desc: 'Descripción editada',
    embed_footer: 'Pie editado',
    embed_banner: 'https://example.com/banner.png',
  };
  let updatedPanel;
  await service.handleInteraction({
    customId: 'booster_color_modal_edit_text',
    guild, member,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isChannelSelectMenu: () => false,
    isModalSubmit: () => true,
    message: { id: 'admin-panel' },
    fields: { getTextInputValue: id => values[id] },
    update: async payload => { updatedPanel = payload; },
  });
  const saved = service.getConfig('guild_fixture');
  assert.equal(saved.title, 'Después');
  assert.equal(saved.description, 'Descripción editada');
  assert.equal(saved.footer, 'Pie editado');
  assert.equal(saved.bannerUrl, 'https://example.com/banner.png');
  assert.equal(updatedPanel.content, '✅ Diseño público actualizado.');
  assert.equal(updatedPanel.embeds[0].data.author.name, 'Comunidad');
  assert.equal(updatedPanel.components.length, 2);
});
