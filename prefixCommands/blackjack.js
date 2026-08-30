// Blackjack prefix command wrapper adaptado para editar el mismo mensaje
const blackjack = require('../commands/games/blackjack.js');

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  usage: 'blackjack <apuesta>',
  description: 'Juega al blackjack contra el bot. Ej: blackjack 500',
  execute: async (message, args, client) => {
    const bet = parseInt(args[0], 10);
    if (isNaN(bet)) return message.reply('Debes especificar la cantidad a apostar. Ej: blackjack 500');
    let sentMsg = null;
    // Simula un objeto interaction para reutilizar la lógica slash
    const interaction = {
      user: message.author,
      guildId: message.guild.id,
      channelId: message.channel.id,
      options: { getInteger: () => bet },
      deferReply: async () => {},
      editReply: async (msg) => {
        if (!sentMsg) {
          sentMsg = await message.reply(msg);
          // Guarda el ID del mensaje en la partida global
          if (global.blackjackGames && global.blackjackGames[message.author.id]) {
            global.blackjackGames[message.author.id].prefixMsgId = sentMsg.id;
            global.blackjackGames[message.author.id].prefixChannelId = sentMsg.channel.id;
          }
        } else {
          await sentMsg.edit(msg);
        }
      },
      replied: false,
      deferred: false
    };
    await blackjack.execute(interaction);
  }
};
