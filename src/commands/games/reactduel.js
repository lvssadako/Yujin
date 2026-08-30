const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { secureRandomInt } = require('../../utils/cryptoRandom');

const MIN_BET = 100;
const MAX_BET = 50000;
const activeDuels = new Set();

/**
 * Inicia el duelo de reacción entre dos usuarios en un canal.
 */
async function startReactDuel(channel, guildId, userA, userB, bet, initialInteraction = null) {
  const duelKeyA = `${guildId}:${userA.id}`;
  const duelKeyB = `${guildId}:${userB.id}`;

  if (activeDuels.has(duelKeyA) || activeDuels.has(duelKeyB)) {
    const errorMsg = '❌ Uno de los participantes ya se encuentra en un duelo activo.';
    if (initialInteraction) {
      if (initialInteraction.replied || initialInteraction.deferred) return initialInteraction.followUp({ content: errorMsg, ephemeral: true });
      return initialInteraction.reply({ content: errorMsg, ephemeral: true });
    }
    return channel.send(errorMsg);
  }

  // Validar balance de ambos jugadores
  const balA = getBalance(guildId, userA.id).coins;
  if (balA < bet) {
    const errorMsg = `❌ <@${userA.id}> no tiene suficientes monedas en su billetera (tienes **${balA.toLocaleString()} 🪙**).`;
    if (initialInteraction) {
      if (initialInteraction.replied || initialInteraction.deferred) return initialInteraction.followUp({ content: errorMsg, ephemeral: true });
      return initialInteraction.reply({ content: errorMsg, ephemeral: true });
    }
    return channel.send(errorMsg);
  }

  const balB = getBalance(guildId, userB.id).coins;
  if (balB < bet) {
    const errorMsg = `❌ <@${userB.id}> no tiene suficientes monedas en su billetera (necesita **${bet.toLocaleString()} 🪙**).`;
    if (initialInteraction) {
      if (initialInteraction.replied || initialInteraction.deferred) return initialInteraction.followUp({ content: errorMsg, ephemeral: true });
      return initialInteraction.reply({ content: errorMsg, ephemeral: true });
    }
    return channel.send(errorMsg);
  }

  activeDuels.add(duelKeyA);
  activeDuels.add(duelKeyB);

  const cleanup = () => {
    activeDuels.delete(duelKeyA);
    activeDuels.delete(duelKeyB);
  };

  const challengeEmbed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setAuthor({ name: '⚔️ Reto de Duelo de Reacción' })
    .setDescription(
      `> <@${userA.id}> ha retado a <@${userB.id}> a un **Duelo de Reacción**!\n\n` +
      `💰 **Apuesta:** **${bet.toLocaleString()} 🪙** por jugador\n` +
      `🏆 **Bote total:** **${(bet * 2).toLocaleString()} 🪙**\n\n` +
      `<@${userB.id}>, ¿aceptas el desafío? (Tienes 30 segundos)`
    )
    .setFooter({ text: 'El primero en reaccionar cuando aparezca el botón se lleva el bote.' })
    .setTimestamp();

  const challengeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_duel_${userA.id}_${userB.id}`)
      .setLabel('⚔️ Aceptar Duelo')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`decline_duel_${userA.id}_${userB.id}`)
      .setLabel('❌ Rechazar')
      .setStyle(ButtonStyle.Danger)
  );

  let challengeMsg;
  if (initialInteraction) {
    if (initialInteraction.replied || initialInteraction.deferred) {
      challengeMsg = await initialInteraction.followUp({ embeds: [challengeEmbed], components: [challengeRow], fetchReply: true });
    } else {
      challengeMsg = await initialInteraction.reply({ embeds: [challengeEmbed], components: [challengeRow], fetchReply: true });
    }
  } else {
    challengeMsg = await channel.send({ embeds: [challengeEmbed], components: [challengeRow] });
  }

  // Colector para la fase de reto
  const challengeCollector = challengeMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30000
  });

  challengeCollector.on('collect', async (i) => {
    if (i.user.id !== userB.id) {
      return i.reply({ content: '❌ Solo el usuario retado puede responder a este desafío.', flags: 64 });
    }

    if (i.customId.startsWith('decline_duel_')) {
      challengeCollector.stop('declined');
      cleanup();
      const declineEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setAuthor({ name: '⚔️ Duelo Rechazado' })
        .setDescription(`> <@${userB.id}> ha rechazado el duelo de <@${userA.id}>.`)
        .setTimestamp();
      return i.update({ embeds: [declineEmbed], components: [] });
    }

    if (i.customId.startsWith('accept_duel_')) {
      challengeCollector.stop('accepted');

      // Verificar y cobrar a ambos jugadores
      const freshBalA = getBalance(guildId, userA.id).coins;
      const freshBalB = getBalance(guildId, userB.id).coins;

      if (freshBalA < bet || freshBalB < bet) {
        cleanup();
        const noFundsEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setAuthor({ name: '❌ Duelo Cancelado' })
          .setDescription('> Uno de los jugadores ya no cuenta con los fondos necesarios en su billetera.')
          .setTimestamp();
        return i.update({ embeds: [noFundsEmbed], components: [] });
      }

      removeCoins(guildId, userA.id, bet);
      removeCoins(guildId, userB.id, bet);

      const prepEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: '⚡ ¡Duelo Aceptado!' })
        .setDescription(
          `> <@${userA.id}> vs <@${userB.id}>\n\n` +
          `💰 **Bote en juego:** **${(bet * 2).toLocaleString()} 🪙**\n\n` +
          `🎯 **¡PREPÁRENSE!**\n` +
          `El botón de disparo aparecerá en cualquier momento...\n` +
          `*¡NO presiones antes de tiempo!*`
        )
        .setTimestamp();

      const waitRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('duel_wait')
          .setLabel('⏳ Esperando la señal...')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await i.update({ embeds: [prepEmbed], components: [waitRow] });

      // Retardo aleatorio de 2.5 a 6.5 segundos
      const randomDelay = secureRandomInt(2500, 6500);

      setTimeout(async () => {
        const triggerTime = Date.now();

        const triggerEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setAuthor({ name: '🔥 ¡FUEGO! ¡PRESIONA YA!' })
          .setDescription(
            `> <@${userA.id}> ⚔️ <@${userB.id}>\n\n` +
            `🎯 **¡EL PRIMERO EN PRESIONAR GANA ${(bet * 2).toLocaleString()} 🪙!**`
          )
          .setTimestamp();

        const triggerRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('duel_fire')
            .setLabel('🎯 ¡DISPARAR!')
            .setStyle(ButtonStyle.Success)
            .setEmoji('⚡')
        );

        try {
          await challengeMsg.edit({ embeds: [triggerEmbed], components: [triggerRow] });
        } catch {
          cleanup();
          return;
        }

        const duelCollector = challengeMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 15000
        });

        let finished = false;

        duelCollector.on('collect', async (di) => {
          if (di.user.id !== userA.id && di.user.id !== userB.id) {
            return di.reply({ content: '❌ No estás participando en este duelo.', flags: 64 });
          }

          if (finished) return;
          finished = true;
          duelCollector.stop('winner');

          const reactionTimeMs = Date.now() - triggerTime;
          const winner = di.user;
          const loser = di.user.id === userA.id ? userB : userA;
          const pot = bet * 2;

          addCoins(guildId, winner.id, pot);

          // Actualizar estadísticas de perfil
          const profiles = readProfiles();
          const pWinner = ensureUser(profiles, guildId, winner.id);
          const pLoser = ensureUser(profiles, guildId, loser.id);

          pWinner.gambleStats = pWinner.gambleStats || { wins: 0, losses: 0, lossesToday: 0, lastAt: 0, day: 0 };
          pLoser.gambleStats = pLoser.gambleStats || { wins: 0, losses: 0, lossesToday: 0, lastAt: 0, day: 0 };

          pWinner.gambleStats.wins = (pWinner.gambleStats.wins || 0) + 1;
          pLoser.gambleStats.losses = (pLoser.gambleStats.losses || 0) + 1;
          writeProfiles(profiles);

          const endEmbed = new EmbedBuilder()
            .setColor(0x57F287)
            .setAuthor({ name: '🏆 ¡Victoria en el Duelo!' })
            .setDescription(
              `> 🎉 <@${winner.id}> fue más rápido y venció a <@${loser.id}>!\n\n` +
              `⚡ **Tiempo de reacción:** **${(reactionTimeMs / 1000).toFixed(3)}s**\n` +
              `💰 **Ganancia:** **+${pot.toLocaleString()} 🪙** *(saldo neto: +${bet.toLocaleString()} 🪙)*\n` +
              `👛 **Nuevo Balance de <@${winner.id}>:** **${getBalance(guildId, winner.id).coins.toLocaleString()} 🪙**`
            )
            .setFooter({ text: '¡Excelente velocidad de reacción!' })
            .setTimestamp();

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('duel_ended')
              .setLabel(`🏆 Ganador: ${winner.username}`)
              .setStyle(ButtonStyle.Success)
              .setDisabled(true)
          );

          await di.update({ embeds: [endEmbed], components: [disabledRow] });
          cleanup();
        });

        duelCollector.on('end', async (_, reason) => {
          cleanup();
          if (reason !== 'winner' && !finished) {
            // Nadie presionó a tiempo: reembolsar a ambos
            addCoins(guildId, userA.id, bet);
            addCoins(guildId, userB.id, bet);

            const timeoutEmbed = new EmbedBuilder()
              .setColor(0x95A5A6)
              .setAuthor({ name: '⌛ Duelo Terminado por Inactividad' })
              .setDescription('> Ninguno de los participantes reaccionó a tiempo. Las apuestas han sido devueltas.')
              .setTimestamp();

            await challengeMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
          }
        });
      }, randomDelay);
    }
  });

  challengeCollector.on('end', async (_, reason) => {
    if (reason === 'time') {
      cleanup();
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0x95A5A6)
        .setAuthor({ name: '⌛ Reto Expirado' })
        .setDescription(`> <@${userB.id}> no respondió al reto a tiempo.`)
        .setTimestamp();
      await challengeMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
    }
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactduel')
    .setDescription('Reta a otro usuario a un duelo de reacción por monedas.')
    .addUserOption(opt => opt.setName('oponente').setDescription('Usuario al que quieres retar').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('apuesta')
        .setDescription('Cantidad de monedas a apostar')
        .setRequired(true)
        .setMinValue(MIN_BET)
        .setMaxValue(MAX_BET)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('oponente');
    const bet = interaction.options.getInteger('apuesta');

    if (target.bot || target.id === interaction.user.id) {
      return interaction.reply({ content: '❌ Debes retar a otro usuario real (no bots ni a ti mismo).', flags: 64 });
    }

    await startReactDuel(interaction.channel, interaction.guildId, interaction.user, target, bet, interaction);
  },

  async executePrefix(message, args) {
    const target = message.mentions.users.first();
    const bet = parseInt(args[0], 10);

    if (!target || target.bot || target.id === message.author.id) {
      return message.reply('❌ Uso correcto: `&reactduel <apuesta> @oponente` (menciona a otro usuario no bot).');
    }

    if (isNaN(bet) || bet < MIN_BET || bet > MAX_BET) {
      return message.reply(`❌ La apuesta debe estar entre **${MIN_BET.toLocaleString()}** y **${MAX_BET.toLocaleString()} 🪙**.`);
    }

    await startReactDuel(message.channel, message.guild.id, message.author, target, bet);
  },

  startReactDuel
};
