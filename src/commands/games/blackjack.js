// Comando Blackjack independiente
// (L├│gica b├ísica, botones y PvP pueden agregarse despu├⌐s)
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const MIN_BET = 100;
const MAX_BET = 10000;
const COOLDOWN_MS = 10000;
// const DAILY_LOSS_CAP = 100000;
const RAKE = 0;

function todayUtcDay() {
  return Math.floor(Date.now() / 86400000);
}

function canBet(u, amount) {
  return true;
}

const { secureChoice } = require('../../utils/cryptoRandom');

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
    let total = 0, ases = 0;
    for (const c of mano) {
      if (typeof c.valor === 'number') total += c.valor;
      else if (c.valor === 'A') { total += 11; ases++; }
      else total += 10;
    }
    while (total > 21 && ases > 0) { total -= 10; ases--; }
    return total;
  },
  manoTexto: function (mano, ocultarPrimera = false) {
    return mano.map((c, i) => ocultarPrimera && i === 0 ? '≡ƒéá' : `${c.valor}${c.palo}`).join(' ');
  }
};

// Mostrar turno con botones
async function mostrarTurno(interaction, partida) {
  const valJ = blackjack.valor(partida.manoJugador);
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('ΓÖá∩╕Å Blackjack')
    .setDescription(
      `Tus cartas: **${blackjack.manoTexto(partida.manoJugador)}**\nValor: **${valJ}**\n\nCartas del bot: **${blackjack.manoTexto(partida.manoBot, true)}**\n\n┬┐Quieres pedir carta o plantarte?`
    )
    .setFooter({ text: 'Usa los botones para jugar tu turno.' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('blackjack_hit').setLabel('Pedir carta').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('blackjack_stand').setLabel('Plantarse').setStyle(ButtonStyle.Secondary)
  );

  // --- PATCH: Edita siempre el mismo mensaje, tanto prefix como slash ---
  let msgId = partida.prefixMsgId;
  let channelId = partida.prefixChannelId;
  if (!msgId && interaction.repliedMsgId) {
    msgId = interaction.repliedMsgId;
    channelId = interaction.channelId;
  }
  if (msgId && channelId && interaction.client) {
    const channel = interaction.client.channels.cache.get(channelId);
    if (channel) {
      try {
        const msg = await channel.messages.fetch(msgId);
        await msg.edit({ embeds: [embed], components: [row] });
        return;
      } catch {}
    }
  }
  // --- FIN PATCH ---

  // Primer mensaje: responde y guarda el ID para futuras ediciones
  if (!partida.prefixMsgId && interaction.reply && !interaction.deferred && !interaction.replied) {
    const sent = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true, ephemeral: false });
    if (sent && sent.id) {
      partida.prefixMsgId = sent.id;
      partida.prefixChannelId = sent.channel.id;
      if (interaction.repliedMsgId === undefined) interaction.repliedMsgId = sent.id;
    }
    return;
  } else {
    // Si ya se respondi├│, edita el mensaje
    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }
}

// Terminar partida y mostrar resultado
async function terminarPartida(interaction, partida, motivo) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, partida.guildId, partida.userId);
  if (!u.gambleStats) {
    u.gambleStats = { wins: 0, losses: 0, lossesToday: 0, lastAt: 0, day: 0 };
  }
  const valJ = blackjack.valor(partida.manoJugador);
  const valB = blackjack.valor(partida.manoBot);
  let resultado = '';
  let color = 0x5865f2;
  let monto = 0;
  if (valJ > 21) {
    resultado = 'Te pasaste. ┬íPerdiste!'; color = 0xdd2e44;
    monto = -partida.apuesta;
    u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
    u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + partida.apuesta;
  } else if (valB > 21 || valJ > valB) {
    monto = partida.apuesta;
    resultado = `┬íGanaste! (+${monto} ≡ƒ¬Ö)`; color = 0x43b581;
    addCoins(partida.guildId, partida.userId, partida.apuesta * 2);
    u.gambleStats.wins = (u.gambleStats.wins || 0) + 1;
  } else if (valJ === valB) {
    monto = 0;
    resultado = 'Empate. Recuperas tu apuesta.'; color = 0xffc107;
    addCoins(partida.guildId, partida.userId, partida.apuesta);
  } else {
    monto = -partida.apuesta;
    resultado = `El bot gana. ┬íPerdiste! (-${partida.apuesta} ≡ƒ¬Ö)`; color = 0xdd2e44;
    u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
    u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + partida.apuesta;
  }
  writeProfiles(profiles);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('ΓÖá∩╕Å Blackjack - Resultado')
    .setDescription(
      `Tus cartas: **${blackjack.manoTexto(partida.manoJugador)}** (${valJ})\nCartas del bot: **${blackjack.manoTexto(partida.manoBot)}** (${valB})\n\n${resultado}` +
      (monto !== 0 ? `\n\n${monto > 0 ? 'Ganancia' : 'P├⌐rdida'}: ${monto > 0 ? '+' : ''}${monto} ≡ƒ¬Ö` : '')
    )
    .setFooter({ text: 'Blackjack vs Bot' });
  // --- PATCH: Edita siempre el mismo mensaje, tanto prefix como slash ---
  let msgId = partida.prefixMsgId;
  let channelId = partida.prefixChannelId;
  if (!msgId && interaction.repliedMsgId) {
    msgId = interaction.repliedMsgId;
    channelId = interaction.channelId;
  }
  if (msgId && channelId && interaction.client) {
    const channel = interaction.client.channels.cache.get(channelId);
    if (channel) {
      try {
        const msg = await channel.messages.fetch(msgId);
        await msg.edit({ embeds: [embed], components: [] });
        partida.terminado = true;
        delete global.blackjackGames[partida.userId];
        return;
      } catch {}
    }
  }
  // --- FIN PATCH ---
  if (interaction.update) {
    await interaction.update({ embeds: [embed], components: [] });
  } else {
    await interaction.editReply({ embeds: [embed], components: [] });
  }
  partida.terminado = true;
  delete global.blackjackGames[partida.userId];
}

// Terminar partida por abandono
async function terminarPartidaAbandono(interaction, partida) {
  const profiles = readProfiles();
  const u = ensureUser(profiles, partida.guildId, partida.userId);
  if (!u.gambleStats) {
    u.gambleStats = { wins: 0, losses: 0, lossesToday: 0, lastAt: 0, day: 0 };
  }
  u.gambleStats.losses = (u.gambleStats.losses || 0) + 1;
  u.gambleStats.lossesToday = (u.gambleStats.lossesToday || 0) + partida.apuesta;
  writeProfiles(profiles);
  const embed = new EmbedBuilder()
    .setColor(0xdd2e44)
    .setTitle('ΓÖá∩╕Å Blackjack - Abandono')
    .setDescription(
      `Partida cancelada por inactividad. Pierdes la apuesta de ${partida.apuesta} ≡ƒ¬Ö.`
    )
    .setFooter({ text: 'Blackjack vs Bot' });
  let msgId = partida.prefixMsgId;
  let channelId = partida.prefixChannelId;
  if (!msgId && interaction.repliedMsgId) {
    msgId = interaction.repliedMsgId;
    channelId = interaction.channelId;
  }
  if (msgId && channelId && interaction.client) {
    const channel = interaction.client.channels.cache.get(channelId);
    if (channel) {
      try {
        const msg = await channel.messages.fetch(msgId);
        await msg.edit({ embeds: [embed], components: [] });
        partida.terminado = true;
        delete global.blackjackGames[partida.userId];
        return;
      } catch {}
    }
  }
  if (interaction.update) {
    await interaction.update({ embeds: [embed], components: [] });
  } else if (typeof interaction.editReply === 'function') {
    await interaction.editReply({ embeds: [embed], components: [] });
  }
  partida.terminado = true;
  delete global.blackjackGames[partida.userId];
}

// Handler de botones (debe llamarse desde interactionCreate.js)
async function handleButton(interaction) {
  if (!interaction.isButton()) return;
  const userId = interaction.user.id;
  const partida = global.blackjackGames && global.blackjackGames[userId];
  if (!partida || partida.terminado) return;
  // Si hay timeout, limpiarlo al interactuar
  if (partida.timeout) {
    clearTimeout(partida.timeout);
    partida.timeout = null;
  }
  if (interaction.customId === 'blackjack_hit') {
    partida.manoJugador.push(blackjack.carta());
    const valJ = blackjack.valor(partida.manoJugador);
    if (valJ > 21) {
      await terminarPartida(interaction, partida, 'lose');
    } else {
      await mostrarTurno(interaction, partida);
    }
  } else if (interaction.customId === 'blackjack_stand') {
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
    .setDescription('Juega al blackjack contra el bot')
    .addIntegerOption(o => o
      .setName('apuesta')
      .setDescription('Cantidad a apostar')
      .setRequired(true)
      .setMinValue(MIN_BET)
      .setMaxValue(MAX_BET)),

  async execute(interaction) {
    // No usar mensaje ephemeral, y no deferReply para slash
    // El mensaje ser├í p├║blico y editable
    const bet = interaction.options.getInteger('apuesta');
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const profiles = readProfiles();
    const u = ensureUser(profiles, guildId, userId);
    const now = Date.now();
    if (!u.gambleStats) u.gambleStats = { lastAt: 0, day: todayUtcDay(), lossesToday: 0, wins: 0, losses: 0 };
    if (u.gambleStats.day !== todayUtcDay()) { u.gambleStats.day = todayUtcDay(); u.gambleStats.lossesToday = 0; }
    const left = COOLDOWN_MS - (now - (u.gambleStats.lastAt || 0));
    if (left > 0) {
      const sec = Math.ceil(left / 1000);
      if (typeof interaction.reply === 'function') {
        await interaction.reply({ content: `ΓÅ│ Espera ${sec}s para volver a apostar.`, ephemeral: false });
      } else if (interaction.message && typeof interaction.message.reply === 'function') {
        await interaction.message.reply(`ΓÅ│ Espera ${sec}s para volver a apostar.`);
      }
      return;
    }
    if (bet == null || bet < MIN_BET) {
      if (typeof interaction.reply === 'function') {
        await interaction.reply({ content: `Γ¥î La apuesta m├¡nima es ${MIN_BET}.`, ephemeral: false });
      } else if (interaction.message && typeof interaction.message.reply === 'function') {
        await interaction.message.reply(`Γ¥î La apuesta m├¡nima es ${MIN_BET}.`);
      }
      return;
    }
    const { coins } = getBalance(guildId, userId);
    if (coins < bet) {
      if (typeof interaction.reply === 'function') {
        await interaction.reply({ content: `Γ¥î Fondos insuficientes. Tienes ${coins} ≡ƒ¬Ö.`, ephemeral: false });
      } else if (interaction.message && typeof interaction.message.reply === 'function') {
        await interaction.message.reply(`Γ¥î Fondos insuficientes. Tienes ${coins} ≡ƒ¬Ö.`);
      }
      return;
    }
    // Sin l├¡mite diario de p├⌐rdidas: se mantiene el comportamiento original del juego sin alterar la experiencia
    if (!removeCoins(guildId, userId, bet)) {
      if (typeof interaction.reply === 'function') {
        await interaction.reply({ content: 'Γ¥î No se pudo procesar la apuesta.', ephemeral: false });
      } else if (interaction.message && typeof interaction.message.reply === 'function') {
        await interaction.message.reply('Γ¥î No se pudo procesar la apuesta.');
      }
      return;
    }

    // Estado global de partidas de blackjack por usuario
    global.blackjackGames = global.blackjackGames || {};
    if (global.blackjackGames[userId]) {
      if (typeof interaction.reply === 'function') {
        await interaction.reply({ content: 'Γ¥ù Ya tienes una partida de blackjack en curso. Usa los botones para continuar.', ephemeral: false });
      } else if (interaction.message && typeof interaction.message.reply === 'function') {
        await interaction.message.reply('Γ¥ù Ya tienes una partida de blackjack en curso. Usa los botones para continuar.');
      }
      return;
    }

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
    // Guardar el id del mensaje para editarlo despu├⌐s
    let sent;
    if (typeof interaction.reply === 'function') {
      sent = await interaction.reply({ content: 'Partida iniciada', fetchReply: true });
    } else if (typeof interaction.editReply === 'function') {
      sent = await interaction.editReply({ content: 'Partida iniciada' });
    } else if (message && typeof message.reply === 'function') {
      sent = await message.reply('Partida iniciada');
    }
    if (sent && sent.id) {
      global.blackjackGames[userId].prefixMsgId = sent.id;
      global.blackjackGames[userId].prefixChannelId = sent.channel.id;
      interaction.repliedMsgId = sent.id;
    }
    await mostrarTurno(interaction, global.blackjackGames[userId]);
    // Timeout de abandono: cancela la partida si no hay interacci├│n en 1 minuto
    global.blackjackGames[userId].timeout = setTimeout(async () => {
      const partida = global.blackjackGames[userId];
      if (partida && !partida.terminado) {
        await terminarPartidaAbandono(interaction, partida);
      }
    }, 60000);
  },
  async executePrefix(message, args, client) {
    const prefixCmd = require('../../prefixCommands/blackjack');
    return prefixCmd.execute(message, args, client);
  },
  handleButton
};
