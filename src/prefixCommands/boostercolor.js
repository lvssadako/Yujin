// Alias for boostercolors prefix command
const boostercolors = require('./boostercolors');

module.exports = {
  name: 'boostercolor',
  description: 'Gestión y envío de autoroles de color para Boosters con prefijo (alias)',
  aliases: ['boostercolors', 'colorbooster', 'colorboosters', 'bcolors'],
  execute: boostercolors.execute,
  executePrefix: boostercolors.execute
};
