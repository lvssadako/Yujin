const { createEmbed } = require('../utils/ui');
const { EmbedBuilder } = require('discord.js');
const { randomUUID } = require('node:crypto');
const { crashService } = require('../services/economy/crashService');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');
const logger = require('../utils/logger');

module.exports = {
  name: 'crash',
  description: 'Multiplicador que sube: retirate antes de que explote',
  usage: '&crash <apuesta> [objetivo]',
  async execute(message, args) {
    if (!message.guildId || !message.author?.id) return message.reply('Este juego solo puede usarse en servidores.');
    const bet = Number(args[0]), target = Number(args[1] ?? 2);
    if (!Number.isSafeInteger(bet) || bet < 1) return message.reply('La apuesta debe ser un entero mayor a cero.');
    if (!Number.isFinite(target) || target < 1.01 || target > 100) return message.reply('El objetivo debe estar entre 1.01 y 100.');
    const initial = createEmbed().setColor(0xffc107).setTitle('Crash')
      .setDescription('Preparando la apuesta...').setFooter({ text: 'Apuesta: ' + bet + ' | Objetivo: ' + target.toFixed(2) + 'x' });
    // A failed acknowledgement cannot debit the wallet.
    const sent = await message.reply({ embeds: [initial] });
    const profiles = readProfiles();
    const profile = ensureUser(profiles, message.guildId, message.author.id);
    const result = crashService.play({
      guildId: message.guildId, userId: message.author.id, bet, target,
      deliveryId: message.id || randomUUID(), legacyStats: profile.gambleStats || {}
    });
    if (result.error) {
      await sent.edit({ content: result.error, embeds: [] });
      return;
    }
    // Refresh profile only when the settled result is ready; never retain a snapshot across animation awaits.
    profile.gambleStats = result.stats;
    try { writeProfiles(profiles); }
    catch (error) { logger.warn('[crash] No se pudieron actualizar estadisticas del perfil', { error: error.message }); }
    const final = createEmbed().setColor(result.won ? 0x43b581 : 0xdd2e44)
      .setTitle(result.won ? 'Crash - Ganaste' : 'Crash - Explotó antes')
      .setDescription('Objetivo: ' + target.toFixed(2) + 'x\nExplotó en: ' + result.crashPoint.toFixed(2) +
        'x\n' + (result.won ? 'Premio: +' + result.gross : 'Apuesta perdida: -' + bet))
      .addFields({ name: 'Balance', value: String(result.coins), inline: true })
      .setFooter({ text: 'Espera 10s antes de volver a apostar.' });
    try {
      const frames = [1, 1.2, 1.5, 1.8, 2, 2.5, 3, 4, 5, 10];
      const animation = EmbedBuilder.from(initial);
      for (const frame of frames) {
        if (frame > Math.min(target, result.crashPoint)) break;
        await new Promise(resolve => setTimeout(resolve, 400));
        animation.setDescription('Subiendo... ' + frame.toFixed(2) + 'x');
        await sent.edit({ embeds: [animation] });
      }
      await sent.edit({ embeds: [final] });
    } catch (error) {
      logger.warn('[crash] La apuesta esta liquidada; fallo la animacion', { error: error.message });
      await message.reply({ embeds: [final] }).catch(() => {});
    }
  }
};
