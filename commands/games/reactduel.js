const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../utils/economy');
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

const MIN_BET = 100;
const MAX_BET = 10000;
const DUEL_ROUNDS = 3;
const REACTION_POOL = ['🔥','💎','🍀','🎲','🎯','⚡','⭐','👑','🦄','🐉','🦊','🐸','🐢','🐇','🐎','🦔'];

async function startReactDuel(channel, guildId, userA, userB, bet) {
  const profiles = readProfiles();
  const a = ensureUser(profiles, guildId, userA.id);
  const b = ensureUser(profiles, guildId, userB.id);
  const balA = getBalance(guildId, userA.id).coins;
  const balB = getBalance(guildId, userB.id).coins;
  if (balA < bet) {
    await channel.send(`No tienes suficientes monedas. Tienes ${balA} 🪙.`);
    return;
  }
  if (balB < bet) {
    await channel.send(`${userB.username} no tiene suficientes monedas para aceptar el reto.`);
    return;
  }
  // Descontar apuesta a ambos
  if (!removeCoins(guildId, userA.id, bet) || !removeCoins(guildId, userB.id, bet)) {
    await channel.send('No se pudo procesar la apuesta. Verifica los saldos.');
    return;
  }
  // Iniciar duelo de reacciones
  let scoreA = 0, scoreB = 0;
  for (let round = 1; round <= DUEL_ROUNDS; round++) {
    const duelEmoji = REACTION_POOL[Math.floor(Math.random() * REACTION_POOL.length)];
    // Mensaje de preparación
    const prepEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`⚡ Ronda ${round}`)
      .setDescription(`Preparando ronda...`)
      .setFooter({ text: `Marcador: ${userA.username} ${scoreA} - ${scoreB} ${userB.username}` });
    const duelMsg = await channel.send({ embeds: [prepEmbed] });
    // Agregar reacciones aleatorias (incluyendo la correcta)
    const shuffled = [...REACTION_POOL].sort(() => Math.random() - 0.5).slice(0, 4);
    if (!shuffled.includes(duelEmoji)) shuffled[0] = duelEmoji;
    for (const em of shuffled) await duelMsg.react(em);
    // Esperar un pequeño delay para asegurar propagación
    await new Promise(r => setTimeout(r, 500));
    // Editar mensaje para avisar que ya pueden reaccionar
    const roundEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`⚡ Ronda ${round}`)
      .setDescription(`¡Ya puedes reaccionar! El primero en reaccionar con ${duelEmoji} gana la ronda.`)
      .setFooter({ text: `Marcador: ${userA.username} ${scoreA} - ${scoreB} ${userB.username}` });
    await duelMsg.edit({ embeds: [roundEmbed] });
    // Collector en tiempo real
    let winner = null;
    const filter = (reaction, user) => [userA.id, userB.id].includes(user.id) && reaction.emoji.name === duelEmoji;
    const collector = duelMsg.createReactionCollector({ filter, max: 1, time: 15000 });
    let collected = false;
    collector.on('collect', (reaction, user) => {
      collected = true;
      if (user.id === userA.id) { scoreA++; winner = userA; }
      else { scoreB++; winner = userB; }
      channel.send(`🏆 ${winner} ganó la ronda ${round}!`);
      collector.stop();
    });
    collector.on('end', (_, reason) => {
      if (!collected) channel.send('⏱️ Nadie reaccionó a tiempo. Ronda desierta.');
    });
    // Esperar a que termine la ronda
    await new Promise(r => collector.once('end', r));
    await new Promise(r => setTimeout(r, 1500));
  }
  // Determinar ganador
  let finalMsg = '';
  let winner = null;
  if (scoreA > scoreB) {
    addCoins(guildId, userA.id, bet * 2);
    finalMsg = `🎉 ¡${userA} gana el duelo y recibe ${bet * 2} 🪙!`;
    winner = userA;
  } else if (scoreB > scoreA) {
    addCoins(guildId, userB.id, bet * 2);
    finalMsg = `🎉 ¡${userB} gana el duelo y recibe ${bet * 2} 🪙!`;
    winner = userB;
  } else {
    addCoins(guildId, userA.id, bet);
    addCoins(guildId, userB.id, bet);
    finalMsg = '🤝 ¡Empate! Ambos recuperan su apuesta.';
  }
  writeProfiles(profiles);
  // Botón de revancha
  const rematchRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('reactduel_rematch').setLabel('Revancha').setStyle(ButtonStyle.Primary)
  );
  const resultMsg = await channel.send({ content: finalMsg, components: [rematchRow] });
  // Esperar botón de revancha
  try {
    const rematchBtn = await resultMsg.awaitMessageComponent({
      filter: i => [userA.id, userB.id].includes(i.user.id) && i.customId === 'reactduel_rematch',
      time: 30000
    });
    // Preguntar confirmación a la otra parte
    const challenger = rematchBtn.user;
    const challenged = challenger.id === userA.id ? userB : userA;
    await rematchBtn.update({ content: `${challenger} quiere una revancha. ${challenged}, ¿aceptas?`, components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('reactduel_acceptrematch').setLabel('Aceptar Revancha').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('reactduel_declinerematch').setLabel('Rechazar').setStyle(ButtonStyle.Danger)
      )
    ] });
    const confirmMsg = await resultMsg.fetch();
    const confirmBtn = await confirmMsg.awaitMessageComponent({
      filter: i => i.user.id === challenged.id && ['reactduel_acceptrematch','reactduel_declinerematch'].includes(i.customId),
      time: 30000
    });
    if (confirmBtn.customId === 'reactduel_acceptrematch') {
      await confirmBtn.update({ content: '¡Revancha aceptada! Iniciando nuevo duelo...', components: [] });
      setTimeout(() => {
        startReactDuel(channel, guildId, userA, userB, bet);
      }, 1500);
    } else {
      await confirmBtn.update({ content: 'Revancha rechazada.', components: [] });
    }
  } catch {
    await resultMsg.edit({ content: finalMsg + '\n⏱️ Nadie pidió revancha o no hubo respuesta.', components: [] });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactduel')
    .setDescription('Reta a otro usuario a un duelo de reacciones por monedas')
    .addIntegerOption(o => o
      .setName('apuesta')
      .setDescription('Cantidad a apostar')
      .setRequired(true)
      .setMinValue(MIN_BET)
      .setMaxValue(MAX_BET))
    .addUserOption(o => o
      .setName('retador')
      .setDescription('Usuario a retar')
      .setRequired(true)),
  async execute(interaction) {
    const bet = interaction.options.getInteger('apuesta');
    const userA = interaction.user;
    const userB = interaction.options.getUser('retador');
    if (!userB || userB.bot || userB.id === userA.id) {
      return interaction.reply({ content: 'Debes retar a otro usuario válido (no bots, no a ti mismo).', ephemeral: true });
    }
    const guildId = interaction.guildId;
    // Enviar invitación
    const inviteEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('⚔️ ReactDuel - Duelo de Reacciones')
      .setDescription(`${userB}, ¿aceptas el reto de ${userA} por **${bet} 🪙**?\n\n¡El primero en reaccionar correctamente gana la ronda!\nAl mejor de ${DUEL_ROUNDS}.`)
      .setFooter({ text: 'Tienes 30s para aceptar.' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pvp_accept').setLabel('Aceptar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pvp_decline').setLabel('Rechazar').setStyle(ButtonStyle.Danger)
    );
    await interaction.reply({ embeds: [inviteEmbed], components: [row] });
    const msg = await interaction.fetchReply();
    const filter = i => i.user.id === userB.id && ['pvp_accept','pvp_decline'].includes(i.customId);
    let accepted = false;
    try {
      const btn = await msg.awaitMessageComponent({ filter, time: 30000 });
      if (btn.customId === 'pvp_accept') {
        accepted = true;
        await btn.update({ content: `¡${userB.username} aceptó el reto!`, embeds: [], components: [] });
      } else {
        await btn.update({ content: `${userB.username} rechazó el reto.`, embeds: [], components: [] });
        return;
      }
    } catch {
      await interaction.editReply({ content: 'El reto expiró por falta de respuesta.', embeds: [], components: [] });
      return;
    }
    if (!accepted) return;
    // Iniciar duelo usando channel.send y pasando los datos
    await module.exports.startReactDuel(interaction.channel, guildId, userA, userB, bet);
  },
  startReactDuel
};