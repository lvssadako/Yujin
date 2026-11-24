const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../economyView');
const { EmbedBuilder } = require('discord.js');

test('helpers: dinero, tiempo relativo y cambios de saldo', () => {
  assert.equal(V.money(1234), '**1,234** 🪙'.replace(',', new Intl.NumberFormat('es-MX').format(1234)[1] === ',' ? ',' : '.'));
  assert.equal(V.relativeTime(1_700_000_000_999), '<t:1700000000:R>');
  assert.match(V.moved(1000, 250), /1.000 → \*\*250\*\* 🪙|1,000 → \*\*250\*\* 🪙/);
});

test('balanceFields y safeBar toleran datos faltantes', () => {
  const fields = V.balanceFields({ coins: 5, bank: 15 });
  assert.deepEqual(fields.map(f => f.name), ['👛 Billetera', '🏦 Banco', '💰 Total']);
  assert.match(fields[2].value, /20/);
  assert.doesNotThrow(() => V.balanceFields(undefined));
  assert.match(V.safeBar({ coins: 0, bank: 0 }), /0%/);
  assert.match(V.safeBar({ coins: 25, bank: 75 }), /75%/);
});

test('withActor pone avatar y autor, y funciona sin usuario', () => {
  const user = { displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png' };
  const e = V.withActor(new EmbedBuilder(), user, 'Título').toJSON();
  assert.equal(e.author.name, 'Título');
  assert.equal(e.author.icon_url, 'https://cdn.discordapp.com/embed/avatars/1.png');
  assert.equal(e.thumbnail.url, 'https://cdn.discordapp.com/embed/avatars/1.png');
  const bare = V.withActor(new EmbedBuilder(), null, 'Solo texto').toJSON();
  assert.equal(bare.author.name, 'Solo texto');
  assert.equal(bare.thumbnail, undefined);
});

test('cooldownField produce un campo con marca de tiempo', () => {
  assert.deepEqual(V.cooldownField('Próximo turno', 1_700_000_000_000), { name: '⏰ Próximo turno', value: '<t:1700000000:R>', inline: true });
});
