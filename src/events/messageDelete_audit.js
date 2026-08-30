
const { logMessageDelete } = require('../services/audit/auditLogger');
module.exports = (client) => {
  client.on('messageDelete', async (message) => {
    await logMessageDelete(message);
  });
};
