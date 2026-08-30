// Comando Ruleta (estructura base, lógica a implementar)
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ruleta')
    .setDescription('Apuesta en la ruleta')
    .addIntegerOption(o => o
      .setName('apuesta')
      .setDescription('Cantidad a apostar')
      .setRequired(true)
      .setMinValue(100)
      .setMaxValue(10000))
    .addStringOption(o => o
      .setName('apuesta_a')
      .setDescription('Apuesta a color o número')
      .addChoices(
        { name: 'Rojo', value: 'rojo' },
        { name: 'Negro', value: 'negro' },
        { name: 'Verde', value: 'verde' },
        { name: 'Número (0-36)', value: 'numero' }
      )
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('numero')
      .setDescription('Número del 0 al 36 (si aplica)')
      .setMinValue(0)
      .setMaxValue(36)
      .setRequired(false)),
  async execute(interaction) {
    const { getBalance, removeCoins, addCoins } = require('../../utils/economy');
    const apuesta = interaction.options.getInteger('apuesta');
    const apuestaA = interaction.options.getString('apuesta_a');
    const numeroApostado = interaction.options.getInteger('numero');
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    await interaction.deferReply({ ephemeral: false });

    // Validar saldo
    const bal = getBalance(guildId, userId);
    if (bal.coins < apuesta) {
      return await interaction.editReply({ content: '❌ No tienes suficientes monedas para apostar.' });
    }

    // Quitar apuesta
    if (!removeCoins(guildId, userId, apuesta)) {
      return await interaction.editReply({ content: '❌ Error al procesar la apuesta.' });
    }

    // Animación de giro
    const { EmbedBuilder } = require('discord.js');
    const animEmbed = new EmbedBuilder()
      .setTitle('🎰 Ruleta')
      .setDescription('🔄 Girando la ruleta...\n\n' + '🟢 🔴 ⚫ 🟢 🔴 ⚫ 🟢 🔴 ⚫')
      .setColor(0x5865f2)
      .setFooter({ text: `Usuario: ${interaction.user.username}` })
      .setTimestamp();
    await interaction.editReply({ embeds: [animEmbed] });
    await new Promise(r => setTimeout(r, 1600));

    // Girar ruleta
    const resultado = Math.floor(Math.random() * 37); // 0-36
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
        // Verde paga 15x, rojo/negro 2x
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
    } else {
      mensaje += '\nOpción de apuesta no válida.';
    }

    // Mostrar saldo final
    const saldoFinal = getBalance(guildId, userId).coins;
    mensaje += `\n💰 Tu saldo actual: **${saldoFinal}** monedas.`;

    // Crear embed resultado
    const embed = new EmbedBuilder()
      .setTitle('🎰 Ruleta')
      .setDescription(mensaje)
      .setColor(embedColor)
      .setFooter({ text: `Usuario: ${interaction.user.username}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};