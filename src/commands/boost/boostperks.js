const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, COLORS } = require('../../utils/ui');
const { readConfig } = require('../../utils/configCache');
const { resolvePerks } = require('../../services/boost/boosterPerks');
const { isBooster } = require('../../services/profile/backgroundAccess');

const pct = n => `${Math.round(n * 100)} %`;

function buildEmbed(member) {
  const perks = resolvePerks(readConfig());
  const booster = isBooster(member);
  const lines = perks.enabled ? [
    perks.xpBonus > 0 && `✨ **+${pct(perks.xpBonus)} de XP** en mensajes, voz y reacciones`,
    perks.coinBonus > 0 && `🪙 **+${pct(perks.coinBonus)} de monedas** al chatear, trabajar y pescar`,
    perks.dailyBonus > 0 && `🎁 **+${pct(perks.dailyBonus)} en tu recompensa diaria**`,
    perks.shopDiscount > 0 && `🛍️ **-${perks.shopDiscount} % extra** en la tienda (se suma al de racha, tope 45 %)`
  ].filter(Boolean) : [];
  lines.push('🎨 Colores exclusivos para tu nombre (menú de colores de Booster)');
  lines.push('🖼️ Fondo de perfil con tu propia imagen, sin límite de cambios');
  return createEmbed(booster ? COLORS.boost : COLORS.economy)
    .setAuthor({ name: '💎 Beneficios de Booster' })
    .setDescription(lines.join('\n') + '\n\n' + (booster
      ? '✅ **Eres Booster:** todos estos beneficios ya están activos para ti. ¡Gracias por apoyar el servidor!'
      : 'Haz un **Server Boost** para activarlos. Mientras tanto puedes conseguir el fondo propio con el Pase (`/fondo comprar`) o una racha de 360 días.'));
}

module.exports = {
  name: 'boostperks',
  description: 'Beneficios que recibes por ser Booster del servidor',
  aliases: ['perks', 'beneficios'],
  data: new SlashCommandBuilder().setName('boostperks').setDescription('Beneficios que recibes por ser Booster del servidor').setDMPermission(false),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: 'Usa este comando dentro de un servidor.', ephemeral: true });
    return interaction.reply({ embeds: [buildEmbed(interaction.member)], ephemeral: true });
  },
  async executePrefix(message) {
    if (!message.guild) return message.reply('Usa este comando dentro de un servidor.');
    return message.reply({ embeds: [buildEmbed(message.member)] });
  },
  buildEmbed
};
