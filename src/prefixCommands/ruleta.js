// Comando ruleta prefix
const { getBalance, removeCoins, addCoins } = require('../services/economy').economyService;
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'ruleta',
  description: 'Apuesta en la ruleta (prefix)',
  usage: 'ruleta <apuesta> <color|numero> [numero]',
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const apuesta = parseInt(args[0]);
    const apuestaA = args[1]?.toLowerCase();
    const numeroApostado = args[2] ? parseInt(args[2]) : undefined;

    if (!apuesta || apuesta < 100 || apuesta > 10000) {
      return message.reply('La apuesta debe ser entre 100 y 10000 monedas.');
    }
    if (!['rojo','negro','verde','numero'].includes(apuestaA)) {
      return message.reply('Apuesta válida: rojo, negro, verde o numero.');
    }

    const bal = getBalance(guildId, userId);
    if (bal.coins < apuesta) {
      return message.reply('❌ No tienes suficientes monedas para apostar.');
    }
    if (!removeCoins(guildId, userId, apuesta)) {
      return message.reply('❌ Error al procesar la apuesta.');
    }

    // Animación de giro
    const animEmbed = new EmbedBuilder()
      .setTitle('🎰 Ruleta')
      .setDescription('🔄 Girando la ruleta...\n\n🟢 🔴 ⚫ 🟢 🔴 ⚫ 🟢 🔴 ⚫')
      .setColor(0x5865f2)
      .setFooter({ text: `Usuario: ${message.author.username}` })
      .setTimestamp();
    const animMsg = await message.reply({ embeds: [animEmbed] });
    await new Promise(r => setTimeout(r, 1600));

    const resultado = Math.floor(Math.random() * 37);
    let color = 'verde';
    if (resultado === 0) color = 'verde';
    else if ([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35].includes(resultado)) color = 'negro';
    else color = 'rojo';

    let ganancia = 0;
    let mensaje = `🎰 Ruleta\nResultado: ${resultado} (${color})`;
    let resultadoVisual = '';

    let embedColor = 0x23272A; // negro por defecto
    if (apuestaA === 'rojo' || apuestaA === 'negro' || apuestaA === 'verde') {
      if (apuestaA === color) {
        ganancia = apuestaA === 'verde' ? apuesta * 15 : apuesta * 2;
        addCoins(guildId, userId, ganancia);
        resultadoVisual = `🟢 Ganaste **${ganancia}** monedas!`;
        embedColor = 0x57F287; // verde si gana
        mensaje += '\n' + resultadoVisual;
      } else {
        resultadoVisual = `🔴 Perdiste **${apuesta}** monedas.`;
        embedColor = 0xED4245; // rojo si pierde
        mensaje += '\nNo acertaste el color. ¡Suerte la próxima!\n' + resultadoVisual;
      }
    } else if (apuestaA === 'numero') {
      if (typeof numeroApostado !== 'number' || numeroApostado < 0 || numeroApostado > 36) {
        mensaje += '\nDebes especificar un número válido entre 0 y 36.';
      } else if (numeroApostado === resultado) {
        ganancia = apuesta * 36;
        addCoins(guildId, userId, ganancia);
        resultadoVisual = `🟢 Ganaste **${ganancia}** monedas!`;
        embedColor = 0x57F287; // verde si gana
        mensaje += `\n¡Increíble! Acertaste el número y ganaste **${ganancia}** monedas.\n` + resultadoVisual;
      } else {
        resultadoVisual = `🔴 Perdiste **${apuesta}** monedas.`;
        embedColor = 0xED4245; // rojo si pierde
        mensaje += `\nNo acertaste el número (${numeroApostado}). ¡Suerte la próxima!\n` + resultadoVisual;
      }
    }

    const saldoFinal = getBalance(guildId, userId).coins;
    mensaje += `\n💰 Tu saldo actual: **${saldoFinal}** monedas.`;

    // Crear embed resultado
    const embed = new EmbedBuilder()
      .setTitle('🎰 Ruleta')
      .setDescription(mensaje)
      .setColor(embedColor)
      .setFooter({ text: `Usuario: ${message.author.username}` })
      .setTimestamp();

    await animMsg.edit({ embeds: [embed] });
  }
};
