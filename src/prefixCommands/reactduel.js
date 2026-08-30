const reactduel = require('../commands/games/reactduel');

module.exports = {
  name: 'reactduel',
  aliases: ['rduel', 'duelo'],
  usage: 'reactduel <apuesta> <@oponente>',
  description: 'Duelo de reacción contra otro usuario. Ej: &reactduel 500 @usuario',
  async execute(message, args, client) {
    return reactduel.executePrefix(message, args, client);
  }
};
