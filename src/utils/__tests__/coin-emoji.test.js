const test = require('node:test');
const assert = require('node:assert/strict');
const { EmbedBuilder } = require('discord.js');
const coin = require('../coinEmoji');

const CUSTOM = '<:yujin_coin:123456789012345678>';

test.afterEach(() => coin.setConfigReaderForTests(null));

test('validación del emoji de moneda', () => {
  assert.equal(coin.isValidCoinEmoji(CUSTOM), true);
  assert.equal(coin.isValidCoinEmoji('<a:coin:123456789012345678>'), true);
  assert.equal(coin.isValidCoinEmoji('🪙'), true);
  for (const bad of ['', 'abc', '<@123456789012345678>', '<:x:12>', '@everyone', null, 5, 'a'.repeat(30)]) assert.equal(coin.isValidCoinEmoji(bad), false, String(bad));
});

test('sin configuración o con valor inválido se usa 🪙', () => {
  coin.setConfigReaderForTests(() => ({}));
  assert.equal(coin.getCoinEmoji(), '🪙');
  coin.setConfigReaderForTests(() => ({ coinEmoji: '<@999>' }));
  assert.equal(coin.getCoinEmoji(), '🪙');
  coin.setConfigReaderForTests(() => { throw new Error('disco'); });
  assert.equal(coin.getCoinEmoji(), '🪙');
});

test('con emoji propio se reemplaza en content y embeds (builder y objeto plano)', () => {
  const embed = new EmbedBuilder().setTitle('Tienes 🪙 5').setDescription('Saldo: **100 🪙**')
    .addFields({ name: '🪙 Banco', value: '20 🪙' }).setFooter({ text: 'pie 🪙' }).setAuthor({ name: 'Autor 🪙' });
  const out = coin.rewriteCoins({ content: 'hola 🪙', embeds: [embed, { description: 'plano 🪙' }], flags: 64 }, CUSTOM);
  assert.equal(out.content, `hola ${CUSTOM}`);
  assert.equal(out.flags, 64);
  const data = out.embeds[0].toJSON();
  assert.equal(data.title, `Tienes ${CUSTOM} 5`);
  assert.equal(data.description, `Saldo: **100 ${CUSTOM}**`);
  assert.equal(data.fields[0].name, `${CUSTOM} Banco`);
  assert.equal(data.footer.text, `pie ${CUSTOM}`);
  assert.equal(data.author.name, `Autor ${CUSTOM}`);
  assert.equal(out.embeds[1].description, `plano ${CUSTOM}`);
});

test('strings, payloads vacíos y emoji por defecto no cambian nada', () => {
  assert.equal(coin.rewriteCoins('x 🪙', CUSTOM), `x ${CUSTOM}`);
  assert.equal(coin.rewriteCoins('x 🪙', '🪙'), 'x 🪙');
  assert.equal(coin.rewriteCoins(undefined, CUSTOM), undefined);
  assert.deepEqual(coin.rewriteCoins({ embeds: [] }, CUSTOM), { embeds: [] });
});

test('installCoinRewriter envuelve una sola vez y respeta el emoji en cada envío', async () => {
  const sent = [];
  class Base { send(payload) { sent.push(payload); return 'ok'; } }
  class TextChannel extends Base {}
  class Message { reply(payload) { sent.push(payload); } }
  const fake = { TextChannel, Message };
  const first = coin.installCoinRewriter(fake);
  assert.ok(first >= 2);
  assert.equal(coin.installCoinRewriter(fake), 0);
  coin.setConfigReaderForTests(() => ({ coinEmoji: CUSTOM }));
  assert.equal(new TextChannel().send('gana 🪙'), 'ok');
  new Message().reply({ content: 'paga 🪙' });
  assert.equal(sent[0], `gana ${CUSTOM}`);
  assert.equal(sent[1].content, `paga ${CUSTOM}`);
});
