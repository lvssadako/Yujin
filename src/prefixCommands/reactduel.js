  // Prefix command for reactduel adaptado para no usar interaction
  const { getBalance, addCoins, removeCoins } = require('../utils/economy');
  const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
  const { EmbedBuilder } = require('discord.js');
  const MIN_BET = 100;
  const DUEL_ROUNDS = 3;

  module.exports = {
    name: 'reactduel',
    usage: 'reactduel <apuesta> <@oponente>',
    description: 'Duelo de reacción contra otro usuario. Ej: reactduel 500 @usuario',
    async execute(message, args, client) {
      if (args.length < 2) return message.reply('Uso: reactduel <apuesta> <@oponente>');
      const bet = parseInt(args[0]);
      const userB = message.mentions.users.first();
      const userA = message.author;
      if (isNaN(bet) || bet < MIN_BET) return message.reply(`❌ La apuesta mínima es ${MIN_BET}.`);
      if (!userB || userB.bot || userB.id === userA.id) return message.reply('Debes mencionar a otro usuario válido (no bots, no a ti mismo).');
      const guildId = message.guildId || message.guild.id;
      // Lógica principal: llama a la función de duelo directamente
      const startReactDuel = require('../commands/games/reactduel.js').startReactDuel;
      await startReactDuel(message.channel, guildId, userA, userB, bet);
    }
  };
