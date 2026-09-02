// Alias for badges command
const badges = require('./badges');

module.exports = {
  name: 'badge',
  description: 'Sistema completo de insignias con prefijo (alias)',
  aliases: ['badges', 'insignia', 'insignias'],
  execute: badges.execute,
  executePrefix: badges.execute
};
