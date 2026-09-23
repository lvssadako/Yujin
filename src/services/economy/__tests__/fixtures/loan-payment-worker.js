// Solo recibe una raíz temporal creada por la suite; nunca carga el bot.
const path = require('node:path');
const assert = require('node:assert/strict');
const [root, action, point, encodedRequest] = process.argv.slice(2);
assert.ok(path.basename(root).startsWith('.tmp-loan-payment-'));
const { createLoanPaymentService } = require(path.join(root, 'src/services/economy/loanPaymentService.js'));
const request = JSON.parse(encodedRequest);
const dataDir = path.join(root, 'data');
const service = createLoanPaymentService({
  dataDir,
  fault(stage) { if (stage === point) process.exit(73); }
});
if (action === 'pay') {
  process.stdout.write(JSON.stringify(service.pay(request)));
} else if (action === 'grant') {
  const { createLoanGrantService } = require(path.join(root, 'src/services/economy/loanGrantService.js'));
  const grants = createLoanGrantService({ dataDir, fault(stage) { if (stage === point) process.exit(73); } });
  process.stdout.write(JSON.stringify(grants.grant(request)));
} else if (action === 'recover') {
  service.recover();
  service.recover();
  process.stdout.write('recovered');
} else if (action === 'credit') {
  const { economyService } = require(path.join(root, 'src/services/economy/index.js'));
  economyService.addCoins(request.guildId, request.userId, 50);
  process.stdout.write('credited');
} else {
  throw new Error('Unknown test action');
}
