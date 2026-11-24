const { createRoleLeaseStore, startLeaseSweeper } = require('./roleLeaseStore');

let store = null;
let stop = null;
const getLeaseStore = () => (store ||= createRoleLeaseStore());

// Inicia el barrido horario que retira los roles comprados cuando vencen.
function init(client, logger) {
  if (stop) return;
  stop = startLeaseSweeper({ store: getLeaseStore(), client, logger });
}
function shutdown() { if (stop) { stop(); stop = null; } }

module.exports = { getLeaseStore, init, shutdown };
