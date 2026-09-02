const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { secureChoice } = require('../../utils/cryptoRandom');
const logger = require('../../utils/logger');

const MIN_BET = 100;
const MAX_BET = 50000;
const COOLDOWN_MS = 5000;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

const blackjack = {
  nuevaMano: function () {
    return [blackjack.carta(), blackjack.carta()];
  },
  carta: function () {
    const palos = ['♠️', '♥️', '♦️', '♣️'];
    const valores = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A'];
    const palo = secureChoice(palos) || '♠️';
    const valor = secureChoice(valores) || 'A';
    return { palo, valor };
  },
  valor: function (mano) {
    let total = 0;
    let ases = 0;
    for (const c of mano) {
      if (typeof c.valor === 'number') {
        total += c.valor;
      } else if (c.valor === 'A') {
        total += 11;
        ases++;
      } else {
        total += 10;
      }
    }
    while (total > 21 && ases > 0) {
      total -= 10;
      ases--;
    }
    return total;
  },
  manoTexto: function (mano, ocultarPrimera = false) {
    return mano
      .map((c, i) => {
        if (ocultarPrimera && i === 0) return '` 🂠 Oculta `';
        return `\` ${c.valor}${c.palo} \``;
      })
      .join(' ');
  }
};

// Generar Embed para el turno actual
function buildTurnEmbed(partida, user) {
  const valJ = blackjack.valor(partida.manoJugador);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: `🃏 Mesa de Blackjack • ${user.username}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setDescription(`Apuesta en juego: **${partida.apuesta.toLocaleString()} 🪙**\nElige tu siguiente movimiento con los botones de abajo.`)
    .addFields(
      {
        name: `👤 Tu Mano • Valor: ${valJ}`,
        value: blackjack.manoTexto(partida.manoJugador),
        inline: false
      },
      {
        name: `🤖 Mano del Bot • Valor: ?`,
        value: blackjack.manoTexto(partida.manoBot, true),
        inline: false
      }
    )
    .setFooter({ text: '🃏 Pide carta para acercarte a 21 o plántate para retar al bot.' })
    .setTimestamp();

  return embed;
}

// Mostrar turno con botones
async function mostrarTurno(interaction, partida) {
  const user = interaction.user || (interaction.message ? interaction.message.author : { username: 'Jugador', displayAvatarURL: () => null });
  const embed = buildTurnEmbed(partida, user);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('blackjack_hit')
      .setLabel('Pedir Carta (Hit)')
      .setEmoji('🃏')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('blackjack_stand')
      .setLabel('Plantarse (Stand)')
      .setEmoji('✋')
      .setStyle(ButtonStyle.Secondary)
  );

  // Si es un botón clickeado
  if (interaction.isButton && interaction.isButton()) {
    try {
      await interaction.update({ content: null, embeds: [embed], components: [row] });
      return;
    } catch (err) {
      logger.warn('[blackjack] Error en interaction.update:', err?.message);
    }
  }

  // Si es interacción de comando slash diferida
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: null, embeds: [embed], components: [row] });
    return;
  }

  // Respuesta inicial
  if (typeof interaction.reply === 'function') {
    const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    if (sent?.id) {
      partida.msgId = sent.id;
      partida.channelId = sent.channel.id;
    }
    return;
  }

  // Prefix fallback
  if (interaction.editReply) {
    await interaction.editReply({ content: null, embeds: [embed], components: [row] });
  }
}

// Terminar partida y mostrar resultado final
async function terminarPartida(interaction, partida, motivo) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, partida.guildId, partida.userId);
  if (!u.gambleStats) {
    u.gambleStats = { wins: 0, losses: 0, lossesToday: 0, lastAt: 0, day: todayUtcDay() };
  }

  const valJ = blackjack.valor(partida.manoJugador);
  const valB = blackjack.valor(partida.manoBot);

  let titulo = '🃏 Blackjack - Fin de Partida';
  let color = 0x5865f2;
  let mensajeResultado = '';
  let gananciaNeta = 0;

  if (valJ > 21) {
    // Jugador se pasó
    color = 0xed4245;
    titulo = '💥 ¡Te has pasado!';
    mensajeResultado = `Superaste los 21 puntos (${valJ}). Has perdido tu apuesta de **${partida.apuesta.toLocaleString()} 🪙**.`;
    gananciaNeta = -partida.apuesta;
    u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
    u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + partida.apuesta;
  } else if (valB > 21) {
    // Bot se pasó
    color = 0x57f287;
    titulo = '🎉 ¡El bot se pasó! ¡Victoria!';
    const ganancia = partida.apuesta * 2;
    addCoins(partida.guildId, partida.userId, ganancia);
    gananciaNeta = partida.apuesta;
    mensajeResultado = `El bot sumó ${valB} puntos y se pasó.\n¡Recibes **+${partida.apuesta.toLocaleString()} 🪙** de ganancia!`;
    u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
  } else if (valJ > valB) {
    // Jugador tiene mano más alta
    color = 0x57f287;
    titulo = '🎉 ¡Has ganado!';
    const ganancia = partida.apuesta * 2;
    addCoins(partida.guildId, partida.userId, ganancia);
    gananciaNeta = partida.apuesta;
    mensajeResultado = `Tu mano (${valJ}) supera la del bot (${valB}).\n¡Recibes **+${partida.apuesta.toLocaleString()} 🪙** de ganancia!`;
    u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
  } else if (valJ === valB) {
    // Empate / Push
    color = 0xfee75c;
    titulo = '🤝 ¡Empate (Push)!';
    addCoins(partida.guildId, partida.userId, partida.apuesta);
    gananciaNeta = 0;
    mensajeResultado = `Ambos obtuvieron ${valJ} puntos.\nSe te ha devuelto tu apuesta íntegra de **${partida.apuesta.toLocaleString()} 🪙**.`;
  } else {
    // Bot gana
    color = 0xed4245;
    titulo = '💀 La casa gana';
    mensajeResultado = `La mano del bot (${valB}) supera la tuya (${valJ}). Has perdido **${partida.apuesta.toLocaleString()} 🪙**.`;
    gananciaNeta = -partida.apuesta;
    u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
    u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + partida.apuesta;
  }

  writeProfiles(profiles);

  const user = interaction.user || (interaction.message ? interaction.message.author : { username: 'Jugador', displayAvatarURL: () => null });
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `🃏 Resultado Blackjack • ${user.username}`,
      iconURL: user.displayAvatarURL({ dynamic: true })
    })
    .setTitle(titulo)
    .setDescription(`${mensajeResultado}`)
    .addFields(
      {
        name: `👤 Tu Mano Final • Valor: ${valJ}`,
        value: blackjack.manoTexto(partida.manoJugador),
        inline: false
      },
      {
        name: `🤖 Mano Final del Bot • Valor: ${valB}`,
        value: blackjack.manoTexto(partida.manoBot),
        inline: false
      },
      {
        name: '📊 Balance Neto de la Partida',
        value: gananciaNeta > 0
          ? `\`+${gananciaNeta.toLocaleString()} 🪙\``
          : gananciaNeta < 0
          ? `\`-${Math.abs(gananciaNeta).toLocaleString()} 🪙\``
          : '`0 🪙 (Recuperada)`',
        inline: true
      }
    )
    .setFooter({ text: '🃏 ¡Gracias por jugar Blackjack en LCO!' })
    .setTimestamp();

  partida.terminado = true;
  if (global.blackjackGames) {
    delete global.blackjackGames[partida.userId];
  }

  // Actualizar mensaje de Discord
  if (interaction.isButton && interaction.isButton()) {
    try {
      await interaction.update({ content: null, embeds: [embed], components: [] });
      return;
    } catch {}
  }

  if (typeof interaction.editReply === 'function') {
    try {
      await interaction.editReply({ content: null, embeds: [embed], components: [] });
      return;
    } catch {}
  }

  if (interaction.reply && !interaction.replied && !interaction.deferred) {
    await interaction.reply({ embeds: [embed], components: [] });
  }
}

// Terminar partida por abandono / timeout
async function terminarPartidaAbandono(interaction, partida) {
  if (partida.terminado) return;
  partida.terminado = true;

  const profiles = readProfiles();
  const u = ensureUser(profiles, partida.guildId, partida.userId);
  if (!u.gambleStats) {
    u.gambleStats = { wins: 0, losses: 0, lossesToday: 0, lastAt: 0, day: todayUtcDay() };
  }
  u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
  u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + partida.apuesta;
  writeProfiles(profiles);

  const embed = new EmbedBuilder()
    .setColor(0xed4245)
    .setTitle('⏳ Partida cancelada por inactividad')
    .setDescription(`No realizaste ninguna acción en 60 segundos.\nSe dio por perdida la apuesta de **${partida.apuesta.toLocaleString()} 🪙**.`)
    .setFooter({ text: 'Blackjack vs Bot' });

  if (global.blackjackGames) {
    delete global.blackjackGames[partida.userId];
  }

  if (interaction.editReply) {
    try {
      await interaction.editReply({ content: null, embeds: [embed], components: [] });
    } catch {}
  }
}

// Manejador central de botones
async function handleButton(interaction) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;
  const partida = global.blackjackGames && global.blackjackGames[userId];

  if (!partida || partida.terminado) {
    return interaction.reply({
      content: '❌ No tienes ninguna partida de blackjack activa en este momento.',
      ephemeral: true
    }).catch(() => null);
  }

  if (partida.timeout) {
    clearTimeout(partida.timeout);
    partida.timeout = null;
  }

  if (interaction.customId === 'blackjack_hit' || interaction.customId === 'blackjackbot_hit') {
    partida.manoJugador.push(blackjack.carta());
    const valJ = blackjack.valor(partida.manoJugador);

    if (valJ > 21) {
      await terminarPartida(interaction, partida, 'bust');
    } else if (valJ === 21) {
      // 21 automático: pasar al bot
      let valB = blackjack.valor(partida.manoBot);
      while (valB < 17) {
        partida.manoBot.push(blackjack.carta());
        valB = blackjack.valor(partida.manoBot);
      }
      await terminarPartida(interaction, partida, 'stand');
    } else {
      await mostrarTurno(interaction, partida);
      // Renovar timeout
      partida.timeout = setTimeout(() => terminarPartidaAbandono(interaction, partida), 60000);
    }
  } else if (interaction.customId === 'blackjack_stand' || interaction.customId === 'blackjackbot_stand') {
    let valB = blackjack.valor(partida.manoBot);
    while (valB < 17) {
      partida.manoBot.push(blackjack.carta());
      valB = blackjack.valor(partida.manoBot);
    }
    await terminarPartida(interaction, partida, 'stand');
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Juega al blackjack clásico contra el bot')
    .addIntegerOption(o =>
      o
        .setName('apuesta')
        .setDescription('Cantidad de monedas a apostar')
        .setRequired(true)
        .setMinValue(MIN_BET)
        .setMaxValue(MAX_BET)
    ),

  async execute(interaction) {
    const bet = interaction.options.getInteger('apuesta');
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const profiles = readProfiles();
    const u = ensureUser(profiles, guildId, userId);
    const now = Date.now();

    if (!u.gambleStats) {
      u.gambleStats = { lastAt: 0, day: todayUtcDay(), lossesToday: 0, wins: 0, losses: 0 };
    }
    if (u.gambleStats.day !== todayUtcDay()) {
      u.gambleStats.day = todayUtcDay();
      u.gambleStats.lossesToday = 0;
    }

    const left = COOLDOWN_MS - (now - (u.gambleStats.lastAt || 0));
    if (left > 0) {
      const sec = Math.ceil(left / 1000);
      return interaction.reply({ content: `⏳ Por favor espera **${sec}s** antes de volver a apostar.`, ephemeral: true });
    }

    if (!bet || bet < MIN_BET) {
      return interaction.reply({ content: `❌ La apuesta mínima es de **${MIN_BET.toLocaleString()} 🪙**.`, ephemeral: true });
    }
    if (bet > MAX_BET) {
      return interaction.reply({ content: `❌ La apuesta máxima es de **${MAX_BET.toLocaleString()} 🪙**.`, ephemeral: true });
    }

    const { coins } = getBalance(guildId, userId);
    if (coins < bet) {
      return interaction.reply({
        content: `❌ Fondos insuficientes. Tienes **${coins.toLocaleString()} 🪙** y necesitas **${bet.toLocaleString()} 🪙**.`,
        ephemeral: true
      });
    }

    // Partida en curso
    global.blackjackGames = global.blackjackGames || {};
    if (global.blackjackGames[userId] && !global.blackjackGames[userId].terminado) {
      return interaction.reply({
        content: '⚠️ Ya tienes una partida de blackjack en curso. Usa los botones de tu mesa activa.',
        ephemeral: true
      });
    }

    // Cobrar apuesta
    if (!removeCoins(guildId, userId, bet)) {
      return interaction.reply({ content: '❌ No se pudo procesar la apuesta.', ephemeral: true });
    }

    u.gambleStats.lastAt = now;
    writeProfiles(profiles);

    // Iniciar partida
    const manoJugador = blackjack.nuevaMano();
    const manoBot = blackjack.nuevaMano();

    global.blackjackGames[userId] = {
      estado: 'jugando',
      apuesta: bet,
      manoJugador,
      manoBot,
      terminado: false,
      guildId,
      userId,
      channelId: interaction.channelId,
      tiempo: Date.now(),
      timeout: null
    };

    const partida = global.blackjackGames[userId];

    // Comprobar Blackjack natural inicial (21)
    const valJ = blackjack.valor(manoJugador);
    const valB = blackjack.valor(manoBot);

    if (valJ === 21 || valB === 21) {
      await terminarPartida(interaction, partida, 'natural');
      return;
    }

    await mostrarTurno(interaction, partida);

    // Timeout de abandono a los 60s
    partida.timeout = setTimeout(() => {
      if (global.blackjackGames?.[userId] && !global.blackjackGames[userId].terminado) {
        terminarPartidaAbandono(interaction, global.blackjackGames[userId]);
      }
    }, 60000);
  },

  async executePrefix(message, args, client) {
    const prefixCmd = require('../../prefixCommands/blackjack');
    return prefixCmd.execute(message, args, client);
  },

  handleButton
};
