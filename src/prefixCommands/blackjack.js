const blackjack = require('../commands/games/blackjack');

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  usage: 'blackjack <apuesta>',
  description: 'Juega al blackjack contra el bot. Ej: blackjack 500',
  execute: async (message, args, client) => {
    const bet = parseInt(args[0], 10);
    if (isNaN(bet) || bet <= 0) {
      return message.reply('❌ Debes especificar una cantidad válida a apostar. Ej: `!blackjack 500`');
    }

    let sentMsg = null;
    const interaction = {
      user: message.author,
      guildId: message.guild.id,
      channelId: message.channel.id,
      client,
      options: { getInteger: () => bet },
      deferReply: async () => {},
      reply: async (msg) => {
        if (!sentMsg) {
          sentMsg = await message.reply(msg);
          if (global.blackjackGames && global.blackjackGames[message.author.id]) {
            global.blackjackGames[message.author.id].msgId = sentMsg.id;
            global.blackjackGames[message.author.id].channelId = sentMsg.channel.id;
          }
          return sentMsg;
        } else {
          return sentMsg.edit(msg);
        }
      },
      editReply: async (msg) => {
        if (!sentMsg) {
          sentMsg = await message.reply(msg);
          if (global.blackjackGames && global.blackjackGames[message.author.id]) {
            global.blackjackGames[message.author.id].msgId = sentMsg.id;
            global.blackjackGames[message.author.id].channelId = sentMsg.channel.id;
          }
          return sentMsg;
        } else {
          return sentMsg.edit(msg);
        }
      },
      replied: false,
      deferred: false
    };

    await blackjack.execute(interaction);
  }
};
