const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Copiar solo código permite usar los servicios reales sin abrir data/ operativo.
// El temporal está bajo __tests__ para resolver discord.js y excluirlo del loader.
function fixture(t, coins) {
  const root = fs.mkdtempSync(path.join(__dirname, '.tmp-loan-repay-'));
  t.after(() => {
    assert.equal(path.dirname(root), __dirname);
    assert.ok(path.basename(root).startsWith('.tmp-loan-repay-'));
    for (const key of Object.keys(require.cache)) {
      if (key.startsWith(root + path.sep)) delete require.cache[key];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const project = path.resolve(__dirname, '../../../..');
  for (const file of [
    'src/commands/economy/loan.js',
    'src/services/economy/index.js',
    'src/services/economy/loanService.js',
    'src/services/economy/loanRules.js',
    'src/services/economy/economyLock.js',
    'src/services/economy/loanPaymentService.js',
    'src/services/economy/loanGrantService.js',
    'src/services/economy/loanPaymentStore.js',
    'src/utils/jsonStore.js'
  ]) {
    const destination = path.join(root, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(project, file), destination);
  }
  const economy = require(path.join(root, 'src/services/economy/index.js')).economyService;
  const loans = require(path.join(root, 'src/services/economy/loanService.js'));
  const command = require(path.join(root, 'src/commands/economy/loan.js'));
  const guild = 'synthetic-guild';
  const user = 'synthetic-user';
  economy.addCoins(guild, user, coins);
  assert.equal(loans.takeLoan(guild, user, 1000).success, true);
  assert.equal(loans.getUserLoanSummary(guild, user).balance, 1050);
  return { root, economy, loans, command, guild, user };
}

const cases = [
  { name: 'parcial', coins: 5000, input: '400', paid: 400 },
  { name: 'exacto', coins: 5000, input: '1050', paid: 1050 },
  { name: 'superior a la deuda', coins: 5000, input: '2000', paid: 1050 },
  { name: 'solicitud mayor que billetera, deuda cubierta', coins: 1500, input: '2000', paid: 1050 },
  { name: 'all liquida', coins: 5000, input: 'all', paid: 1050 },
  { name: 'all parcial', coins: 400, input: 'all', paid: 400 },
  { name: 'alias todo', coins: 5000, input: 'todo', paid: 1050 },
  { name: 'fondos insuficientes', coins: 400, input: '500', paid: 0, error: /No tienes suficientes monedas/ },
  { name: 'all sin fondos', coins: 0, input: 'all', paid: 0, error: /No tienes monedas para pagar/ }
];

for (const scenario of cases) {
  test(`repay: ${scenario.name}, paridad slash/prefix`, async t => {
    const responses = [];
    for (const mode of ['slash', 'prefix']) {
      await t.test(mode, async t => {
        const f = fixture(t, scenario.coins);
        const files = ['economy.json', 'loans.json'].map(name => path.join(f.root, 'data', name));
        const before = files.map(file => fs.readFileSync(file, 'utf8'));
        const replies = [];
        const reply = payload => { replies.push(payload); };
        if (mode === 'slash') {
          await f.command.execute({
            id: 'synthetic-delivery', guildId: f.guild, user: { id: f.user }, reply,
            options: { getSubcommand: () => 'repay', getString: () => scenario.input }
          });
        } else {
          await f.command.executePrefix({ id: 'synthetic-delivery', guild: { id: f.guild }, author: { id: f.user }, reply }, ['repay', scenario.input]);
        }
        assert.equal(replies.length, 1);
        const balance = f.economy.getBalance(f.guild, f.user);
        const loan = f.loans.getUserLoanSummary(f.guild, f.user);
        const remaining = loan.active ? loan.balance : 0;
        assert.equal(balance.coins, scenario.coins - scenario.paid);
        assert.equal(remaining, 1050 - scenario.paid);
        assert.equal(scenario.coins - balance.coins, 1050 - remaining, 'descuento = pago aplicado');
        for (const file of files) assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')));
        if (scenario.error) {
          const content = mode === 'slash' ? replies[0].content : replies[0];
          assert.match(content, scenario.error);
          if (mode === 'slash') assert.equal(replies[0].ephemeral, true);
          assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), before);
          responses.push(content);
        } else {
          const embed = replies[0].embeds[0].toJSON();
          const paidField = embed.fields.find(field => field.name === '💸 Pago Realizado');
          assert.equal(paidField.value, `> **${scenario.paid.toLocaleString()} 🪙**`);
          delete embed.timestamp;
          responses.push(embed);
        }
      });
    }
    assert.deepEqual(responses[0], responses[1]);
  });
}

for (const mode of ['slash', 'prefix']) {
  test(`${mode}: entrega duplicada no cobra ni responde otra vez; nueva entrega sí`, async t => {
    const f = fixture(t, 5000);
    const replies = [];
    const reply = payload => { replies.push(payload); };
    const invoke = async id => {
      if (mode === 'slash') {
        return f.command.execute({
          id, guildId: f.guild, user: { id: f.user }, reply,
          options: { getSubcommand: () => 'repay', getString: () => '400' }
        });
      }
      return f.command.executePrefix({ id, guild: { id: f.guild }, author: { id: f.user }, reply }, ['pagar', '400']);
    };
    await Promise.all([invoke('delivery-1'), invoke('delivery-1')]);
    assert.equal(replies.length, 1);
    assert.equal(f.economy.getBalance(f.guild, f.user).coins, 4600);
    assert.equal(f.loans.getUserLoanSummary(f.guild, f.user).balance, 650);
    await invoke('delivery-2');
    assert.equal(replies.length, 2);
    assert.equal(f.economy.getBalance(f.guild, f.user).coins, 4200);
    assert.equal(f.loans.getUserLoanSummary(f.guild, f.user).balance, 250);
  });

  test(`${mode}: fallo persistente no anuncia éxito ni expone detalles internos`, async t => {
    const f = fixture(t, 5000);
    const payments = require(path.join(f.root, 'src/services/economy/loanPaymentService.js'));
    const failing = payments.createLoanPaymentService({
      dataDir: path.join(f.root, 'data'),
      fault(point) { if (point === 'wallet:after-rename') throw new Error('synthetic-sensitive-diagnostic'); }
    });
    const mock = t.mock.method(payments.loanPaymentService, 'pay', failing.pay);
    const replies = [];
    const reply = payload => { replies.push(payload); };
    if (mode === 'slash') {
      await f.command.execute({
        id: 'delivery-failure', guildId: f.guild, user: { id: f.user }, reply,
        options: { getSubcommand: () => 'repay', getString: () => '400' }
      });
    } else {
      await f.command.executePrefix({ id: 'delivery-failure', guild: { id: f.guild }, author: { id: f.user }, reply }, ['repay', '400']);
    }
    mock.mock.restore();
    assert.equal(replies.length, 1);
    const content = mode === 'slash' ? replies[0].content : replies[0];
    assert.match(content, /No se pudo confirmar el pago/);
    assert.doesNotMatch(content, /synthetic-sensitive-diagnostic/);
    assert.equal(replies[0].embeds, undefined);
    // Esta lectura recupera lo pendiente; no se compensa el débito en memoria.
    assert.equal(f.economy.getBalance(f.guild, f.user).coins, 4600);
    assert.equal(f.loans.getUserLoanSummary(f.guild, f.user).balance, 650);
  });
}
