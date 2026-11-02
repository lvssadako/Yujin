const { SlashCommandBuilder } = require('discord.js');
const { createEmbed, formatNumber, clip } = require('../../utils/ui');
const { getBalance, getInventory } = require('../../services/economy').economyService;

async function renderBalance(guildId, target) {
  const balance = getBalance(guildId, target.id);
  const inventory = Object.entries(getInventory(guildId, target.id));
  const items = inventory.slice(0, 15).map(([item, count]) => '• ' + clip(item, 36) + ' × ' + formatNumber(count));
  if (inventory.length > 15) items.push('… y ' + (inventory.length - 15) + ' objetos más.');
  const embed = createEmbed().setAuthor({ name: 'Yujin ♥ · Economía', iconURL: target.displayAvatarURL() })
    .setTitle(clip('Cuenta de ' + (target.displayName || target.globalName || target.username), 256))
    .addFields(
      { name: 'Billetera', value: '**' + formatNumber(balance.coins) + '** monedas', inline: true },
      { name: 'Banco', value: '**' + formatNumber(balance.bank) + '** monedas', inline: true },
      { name: 'Total', value: '**' + formatNumber(balance.coins + balance.bank) + '** monedas', inline: true },
      { name: 'Inventario', value: items.join('\n') || 'Tu mochila está vacía. Explora `/shop` o `/buy` para conseguir objetos.', inline: false }
    ).setFooter({ text: 'Guarda monedas con /bank deposit · Explora /shop y /buy' });
  const { getLoan, MAX_DEBT_MULTIPLIER } = require('../../services/economy/loanService');
  const loan = getLoan(guildId, target.id);
  if (loan?.active) {
    const penalty = ['Sin penalización', 'Advertencia', 'Ingresos de trabajo y pesca al 50%', 'Ingresos de trabajo y pesca al 25%'];
    const capped = loan.balance >= Math.floor(loan.principal * MAX_DEBT_MULTIPLIER);
    embed.addFields({ name: 'Préstamo activo', value: '**' + formatNumber(loan.balance) + ' monedas** de deuda' + (capped ? ' · Tope alcanzado' : '') + '\nInterés diario: ' + (loan.interestRate * 100).toFixed(0) + '% · ' + (penalty[loan.penaltyLevel] || penalty[0]) + '\nConsulta `/loan status` o realiza un pago con `/loan repay`.', inline: false });
  }
  return embed;
}
module.exports = {
  data: new SlashCommandBuilder().setName('balance').setDescription('Consulta tu saldo, inventario y préstamo activo.').addUserOption(option => option.setName('usuario').setDescription('Usuario que quieres consultar')),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: 'Abre este comando en un servidor para consultar la cuenta.', flags: 64 });
    return interaction.reply({ embeds: [await renderBalance(interaction.guildId, interaction.options.getUser('usuario') || interaction.user)] });
  },
  async executePrefix(message) {
    if (!message.guild) return message.reply('Abre este comando en un servidor para consultar la cuenta.');
    return message.reply({ embeds: [await renderBalance(message.guild.id, message.mentions.users.first() || message.author)] });
  },
  renderBalance,
};
