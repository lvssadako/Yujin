const test = require('node:test');
const assert = require('node:assert/strict');
const { economyService } = require('../../../services/economy');

// Cada prueba usa identificadores únicos para no mezclar estados con otras ejecuciones.
let counter = 0;
const uid = () => `9${String(Date.now()).slice(-9)}${String(++counter).padStart(2, '0')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
const avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';

function fake(guildId, userId, mention = null) {
  const replies = [];
  const author = { id: userId, bot: false, username: 'tester', tag: 'tester#0', displayAvatarURL: () => avatar };
  const message = {
    guild: { id: guildId, name: 'Servidor de prueba', iconURL: () => avatar, members: { cache: new Map() }, client: { users: { cache: new Map() } } },
    member: { id: userId, roles: { cache: new Map() }, premiumSince: null, guild: { roles: {} } },
    author, channel: {}, mentions: { users: { first: () => mention, size: mention ? 1 : 0 } },
    reply: async payload => { replies.push(payload); return payload; }
  };
  return { message, replies };
}
const embedOf = payload => payload.embeds[0].toJSON();
function assertLimits(e) {
  assert.ok((e.title || '').length <= 256); assert.ok((e.description || '').length <= 4096);
  assert.ok((e.fields || []).length <= 25);
  for (const f of e.fields || []) { assert.ok(f.name.length <= 256); assert.ok(f.value.length <= 1024); }
}

test('/bank deposit y withdraw muestran el cambio de saldo, la barra de dinero a salvo y respetan límites', async () => {
  const bank = require('../bank');
  const g = uid(); const u = uid();
  economyService.addCoins(g, u, 1000);
  const { message, replies } = fake(g, u);
  await bank.executePrefix(message, ['deposit', '400']);
  const dep = embedOf(replies[0]);
  assertLimits(dep);
  assert.match(dep.author.name, /Depósito exitoso/);
  assert.equal(dep.author.icon_url, avatar);
  assert.match(JSON.stringify(dep.fields), /→/);
  assert.match(JSON.stringify(dep.fields), /a salvo/i);
  await bank.executePrefix(message, ['withdraw', 'all']);
  assert.match(embedOf(replies[1]).author.name, /Retiro exitoso/);
  assert.equal(economyService.getBalance(g, u).coins, 1000); // la lógica no cambió
});

test('/bank con datos inválidos sigue respondiendo texto claro', async () => {
  const bank = require('../bank');
  const g = uid(); const u = uid();
  const { message, replies } = fake(g, u);
  await bank.executePrefix(message, ['deposit', 'abc']);
  assert.match(replies[0], /Cantidad inválida/);
});

test('/transfer muestra quién recibe y el antes → después de la billetera', async () => {
  const transfer = require('../transfer');
  const g = uid(); const u = uid(); const target = { id: uid(), bot: false, username: 'dest', tag: 'dest#0' };
  economyService.addCoins(g, u, 900);
  const { message, replies } = fake(g, u, target);
  await transfer.executePrefix(message, [`<@${target.id}>`, '300']);
  const e = embedOf(replies[0]);
  assertLimits(e);
  assert.match(e.author.name, /Transferencia/);
  assert.match(e.description, new RegExp(target.id));
  assert.match(JSON.stringify(e.fields), /→/);
  assert.equal(economyService.getBalance(g, target.id).coins, 300);
  assert.equal(economyService.getBalance(g, u).coins, 600);
});

test('/work y /fish muestran ganancia, billetera y cuándo se puede repetir', async () => {
  const work = require('../work'); const fish = require('../fish');
  const g = uid(); const u = uid();
  const w = fake(g, u);
  await work.executePrefix(w.message);
  const we = embedOf(w.replies[0]);
  assertLimits(we);
  assert.match(we.author.name, /Jornada completada/);
  assert.match(JSON.stringify(we.fields), /<t:\d+:R>/);
  assert.match(JSON.stringify(we.fields), /Billetera/);
  // segunda vez: cooldown, mensaje de texto
  await work.executePrefix(w.message);
  assert.equal(typeof w.replies[1], 'string');

  economyService.addItem(g, u, 'cana', 1);
  const f = fake(g, u);
  await fish.executePrefix(f.message);
  const fe = embedOf(f.replies[0]);
  assertLimits(fe);
  assert.match(fe.author.name, /Día de pesca/);
  assert.match(JSON.stringify(fe.fields), /<t:\d+:R>/);
  // el texto muestra lo que realmente se acreditó
  assert.doesNotMatch(fe.description, /\{reward\}/);
});

test('/rob muestra el resultado con cooldown visible', async () => {
  const rob = require('../rob');
  const g = uid(); const u = uid(); const victim = { id: uid(), bot: false, username: 'victima', tag: 'victima#0' };
  economyService.addCoins(g, victim.id, 5000);
  const { message, replies } = fake(g, u, victim);
  economyService.addCoins(g, u, 1000);
  await rob.executePrefix(message);
  const e = embedOf(replies[0]);
  assertLimits(e);
  assert.match(e.author.name, /Robo/);
  assert.match(JSON.stringify(e.fields), /<t:\d+:R>/);
});

test('/ecotop muestra barras, medallas y la posición de quien consulta', async () => {
  const top = require('../top');
  const profileStore = require('../../../utils/profileStore');
  const g = uid(); const ids = [uid(), uid(), uid()];
  const profiles = profileStore.readProfiles();
  ids.forEach((id, i) => { profileStore.ensureUser(profiles, g, id); economyService.addCoins(g, id, (3 - i) * 1000); });
  profileStore.writeProfiles(profiles);
  const { message, replies } = fake(g, ids[1]);
  await top.executePrefix(message);
  const e = embedOf(replies[0]);
  assertLimits(e);
  assert.match(e.description, /🥇/);
  assert.match(e.description, /▰/);
  assert.match(JSON.stringify(e.fields), /Tu posición: \*\*#2\*\*/);
});
