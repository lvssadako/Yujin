const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('../../../services/economy/__tests__/fixtures/loan-payment-fixture');

async function invoke(f, mode, amount, reply, id = 'grant-delivery', sub = 'take') {
  const command = f.load('src/commands/economy/loan.js');
  if (mode === 'slash') {
    return command.execute({
      id, guildId: f.guild, user: { id: f.user }, reply,
      options: { getSubcommand: () => 'take', getInteger: () => Number(amount) }
    });
  }
  return command.executePrefix({ id, guild: { id: f.guild }, author: { id: f.user }, reply }, [sub, amount]);
}

for (const mode of ['slash', 'prefix']) {
  test(`${mode}: fallo de crédito no deja deuda sin monedas tras recuperar`, async t => {
    const f = fixture(t, 0, { withLoan: false });
    const walletPath = path.join(f.dataDir, 'economy.json');
    const rename = fs.renameSync;
    const copy = fs.copyFileSync;
    const failRename = t.mock.method(fs, 'renameSync', (from, to) => {
      if (to === walletPath) throw new Error('synthetic wallet failure');
      return rename(from, to);
    });
    const failCopy = t.mock.method(fs, 'copyFileSync', (from, to, ...args) => {
      if (to === walletPath) throw new Error('synthetic wallet failure');
      return copy(from, to, ...args);
    });
    const replies = [];
    try { await invoke(f, mode, '1000', payload => replies.push(payload)); } catch (error) {
      // La implementación anterior propagaba el error después de guardar la deuda.
      assert.match(error.message, /synthetic wallet failure/);
    }
    failRename.mock.restore();
    failCopy.mock.restore();
    assert.ok(replies.every(payload => !payload.embeds), 'no confirmar éxito con crédito pendiente');
    f.service.recover();
    assert.equal(f.economy.getBalance(f.guild, f.user).coins, 1000);
    assert.equal(f.loans.getLoan(f.guild, f.user).balance, 1050);
  });
}

const cases = [
  { amount: '500' }, { amount: '501' }, { amount: '1000' }, { amount: '100000' },
  { amount: '499', error: `❌ El préstamo mínimo es **${(500).toLocaleString()} 🪙**.` },
  { amount: '100001', error: `❌ El préstamo máximo es **${(100000).toLocaleString()} 🪙**.` },
  { amount: '0', error: '❌ Especifica una cantidad válida (entre 500 y 100,000 🪙).' },
  { amount: '1000', active: true, error: '❌ Ya tienes un préstamo activo. Págalo primero antes de solicitar uno nuevo.' }
];

for (const scenario of cases) {
  test(`otorgamiento ${scenario.amount}${scenario.active ? ' con deuda activa' : ''}: paridad y mensajes`, async t => {
    const responses = [];
    for (const mode of ['slash', 'prefix']) {
      await t.test(mode, async t => {
        const f = fixture(t, 250, { withLoan: Boolean(scenario.active) });
        const beforeWallet = fs.readFileSync(path.join(f.dataDir, 'economy.json'), 'utf8');
        const beforeLoan = scenario.active ? fs.readFileSync(path.join(f.dataDir, 'loans.json'), 'utf8') : null;
        const replies = [];
        const reply = payload => {
          // Verificar con lecturas crudas: una lectura del servicio podría recuperar y ocultar el error.
          assert.equal(f.raw('loan-payments').pending, null);
          if (payload.embeds) {
            assert.equal(f.raw('economy').guilds[f.guild][f.user].coins, 250 + Number(scenario.amount));
            assert.equal(f.raw('loans').guilds[f.guild][f.user].principal, Number(scenario.amount));
          }
          replies.push(payload);
        };
        await invoke(f, mode, scenario.amount, reply);
        assert.equal(replies.length, 1);
        if (scenario.error) {
          const content = mode === 'slash' ? replies[0].content : replies[0];
          assert.equal(content, scenario.error);
          if (mode === 'slash') assert.equal(replies[0].ephemeral, true);
          assert.equal(fs.readFileSync(path.join(f.dataDir, 'economy.json'), 'utf8'), beforeWallet);
          if (beforeLoan !== null) assert.equal(fs.readFileSync(path.join(f.dataDir, 'loans.json'), 'utf8'), beforeLoan);
          else assert.equal(fs.existsSync(path.join(f.dataDir, 'loans.json')), false);
          responses.push(content);
        } else {
          const amount = Number(scenario.amount);
          const interest = Math.ceil(amount * 0.05);
          const embed = replies[0].embeds[0].toJSON();
          assert.equal(embed.author.name, '🏦 Préstamo Aprobado');
          assert.equal(embed.color, 0x5865F2);
          assert.equal(embed.fields.length, 6);
          assert.equal(embed.fields[0].value, `> **${amount.toLocaleString()} 🪙**`);
          assert.equal(embed.fields[1].value, `> **${interest.toLocaleString()} 🪙** *(5%)*`);
          assert.equal(embed.fields[2].value, `> **${(amount + interest).toLocaleString()} 🪙**`);
          assert.equal(embed.fields[3].value, '> **5%** diario');
          assert.equal(embed.fields[4].value, `> **${(250 + amount).toLocaleString()} 🪙**`);
          assert.match(embed.fields[5].value, /cada 24 horas/);
          assert.match(embed.fields[5].value, /2\.5x/);
          assert.equal(embed.footer.text, 'Paga a tiempo para evitar penalizaciones e intereses crecientes.');
          delete embed.timestamp;
          responses.push(embed);
        }
        await invoke(f, mode, scenario.amount, reply);
        assert.equal(replies.length, 1, 'la entrega duplicada no genera otro mensaje');
      });
    }
    assert.deepEqual(responses[0], responses[1]);
  });
}

test('alias &loan pedir y rechazo de contexto sin servidor', async t => {
  const f = fixture(t, 0, { withLoan: false });
  const replies = [];
  await invoke(f, 'prefix', '1000', payload => replies.push(payload), 'alias-delivery', 'pedir');
  assert.equal(replies[0].embeds[0].toJSON().author.name, '🏦 Préstamo Aprobado');
  const command = f.load('src/commands/economy/loan.js');
  await command.executePrefix({ id: 'dm', guild: null, author: { id: f.user }, reply: payload => replies.push(payload) }, ['take', '1000']);
  assert.match(replies[1], /dentro de un servidor/);
  assert.equal(f.economy.getBalance(f.guild, f.user).coins, 1000);
});

for (const mode of ['slash', 'prefix']) {
  test(`${mode}: error después de persistir no anuncia éxito ni vuelve a otorgar`, async t => {
    const f = fixture(t, 0, { withLoan: false });
    const grants = f.load('src/services/economy/loanGrantService.js');
    const faulty = grants.createLoanGrantService({ dataDir: f.dataDir,
      fault(point) { if (point === 'committed:after-rename') throw new Error('synthetic-sensitive-diagnostic'); } });
    const mock = t.mock.method(grants.loanGrantService, 'grant', faulty.grant);
    const replies = [];
    await invoke(f, mode, '1000', payload => replies.push(payload));
    mock.mock.restore();
    const content = mode === 'slash' ? replies[0].content : replies[0];
    assert.match(content, /No se pudo confirmar el préstamo/);
    assert.doesNotMatch(content, /synthetic-sensitive-diagnostic/);
    assert.equal(replies[0].embeds, undefined);
    await invoke(f, mode, '1000', payload => replies.push(payload));
    assert.equal(replies.length, 1);
    assert.equal(f.economy.getBalance(f.guild, f.user).coins, 1000);
    assert.equal(f.loans.getLoan(f.guild, f.user).balance, 1050);
  });
}
