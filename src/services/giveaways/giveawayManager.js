
const fs = require('fs');
const path = require('path');
const { writeJsonAtomic } = require('../../utils/jsonStore');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/logger');

const filePath = path.join(__dirname, '../../../data/giveaways.json');
let clientRef = null;

function readGiveaways() {
  if (!fs.existsSync(filePath)) return {};
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return {}; }
}
function writeGiveaways(data) { writeJsonAtomic(filePath, data); }

const { secureRandomInt } = require('../../utils/cryptoRandom');

async function endGiveaway(messageId, guildId, channelId) {
  const gws = readGiveaways();
  const gw = gws[messageId];
  if (!gw || gw.ended) return;
  gw.ended = true;
  writeGiveaways(gws);
  
  try {
    const guild = await clientRef.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    const msg = await channel.messages.fetch(messageId);
    
    let winners = [];
    if (gw.entries.length > 0) {
      const pool = [...gw.entries];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = secureRandomInt(0, i);
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      winners = pool.slice(0, gw.winnerCount);
    }
    
    const emb = EmbedBuilder.from(msg.embeds[0])
      .setColor(0x2F3136) // Dark theme color for ended
      .setTitle('🎊 Sorteo Finalizado 🎊')
      .setDescription(`🎁 **Premio:** ${gw.prize}\n🏆 **Ganadores:** ${gw.winnerCount}\n👑 **Host:** <@${gw.hostId || 'N/A'}>\n\n🎉 **Ganadores Oficiales:**\n${winners.length > 0 ? winners.map(id => `> <@${id}>`).join('\n') : '> *Nadie participó.*'}`);
    
    const disabledBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gw_join').setLabel('Sorteo Finalizado').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true)
    );
    
    await msg.edit({ embeds: [emb], components: [disabledBtn] });
    
    if (winners.length > 0) {
      await channel.send(`🎉 ¡Felicidades ${winners.map(id => `<@${id}>`).join(', ')}! Has ganado: **${gw.prize}**`);
    } else {
      await channel.send('😢 Ningún usuario participó en el sorteo.');
    }
  } catch (err) {
    logger.error('Error finalizando sorteo', err);
  }
}

function init(client) {
  clientRef = client;
  const gws = readGiveaways();
  const now = Date.now();
  for (const [msgId, gw] of Object.entries(gws)) {
    if (!gw.ended) {
      if (gw.endAt <= now) {
        endGiveaway(msgId, gw.guildId, gw.channelId);
      } else {
        setTimeout(() => endGiveaway(msgId, gw.guildId, gw.channelId), gw.endAt - now);
      }
    }
  }
  
  // Handler de botones para sorteos
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'gw_join') return;
    const msgId = interaction.message.id;
    const data = readGiveaways();
    const gw = data[msgId];
    
    if (!gw || gw.ended) return interaction.reply({ content: '❌ Este sorteo ya ha terminado.', ephemeral: true });
    
    if (gw.entries.includes(interaction.user.id)) {
      // Retirar
      gw.entries = gw.entries.filter(id => id !== interaction.user.id);
      writeGiveaways(data);
      await interaction.reply({ content: '🚪 Has abandonado el sorteo.', ephemeral: true });
    } else {
      // Unirse
      gw.entries.push(interaction.user.id);
      writeGiveaways(data);
      await interaction.reply({ content: '🎉 ¡Has entrado al sorteo! ¡Mucha suerte!', ephemeral: true });
    }
    
    // Actualizar conteo visual (sin saturar API preferiblemente, pero por ahora edit simple)
    const emb = EmbedBuilder.from(interaction.message.embeds[0]);
    emb.setFooter({ text: `Participantes: ${gw.entries.length} • Termina` });
    try { await interaction.message.edit({ embeds: [emb] }); } catch(e){}
  });
}

async function createGiveaway(channel, prize, durationMs, winnerCount, hostId) {
  const endAt = Date.now() + durationMs;
  const endTs = Math.floor(endAt / 1000);
  
  const emb = new EmbedBuilder()
    .setTitle('🎁 ¡Sorteo Activo! 🎁')
    .setDescription(`**Premio:** ${prize}\n**Ganadores:** ${winnerCount}\n**Organizado por:** <@${hostId}>\n\n⏳ **Termina:** <t:${endTs}:R> (<t:${endTs}:f>)\n\n*¡Toca el botón 🎉 abajo para participar!*`)
    .setColor(0x5865F2)
    .setFooter({ text: `Participantes: 0` })
    .setTimestamp(endAt);
    
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('gw_join').setLabel('Participar').setEmoji('🎉').setStyle(ButtonStyle.Success)
  );
  
  const msg = await channel.send({ embeds: [emb], components: [row] });
  
  const gws = readGiveaways();
  gws[msg.id] = {
    guildId: channel.guild.id,
    channelId: channel.id,
    prize,
    winnerCount,
    endAt,
    ended: false,
    entries: []
  };
  writeGiveaways(gws);
  setTimeout(() => endGiveaway(msg.id, channel.guild.id, channel.id), durationMs);
  return msg.id;
}

module.exports = { init, createGiveaway, endGiveaway };
