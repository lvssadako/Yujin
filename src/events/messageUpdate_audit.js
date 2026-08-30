
const { logMessageUpdate } = require('../services/audit/auditLogger');
module.exports = (client) => {
  client.on('messageUpdate', async (oldMsg, newMsg) => {
    if (oldMsg.partial) try { await oldMsg.fetch(); } catch (e) { return; }
    await logMessageUpdate(oldMsg, newMsg);
  });
};
