
const automodService = require('../services/automod/automodService');
module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    await automodService.checkMessage(message);
  });
};
