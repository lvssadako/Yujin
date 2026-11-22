const { SlashCommandBuilder } = require('discord.js');
const { INVENTORY_ITEMS } = require('../../services/shop/shopCatalog');
const { runPurchase } = require('./shop');

const ids = INVENTORY_ITEMS.map(i => i.id);
const label = i => `${i.name} (${i.price.toLocaleString('es-MX')} 🪙)`;

// Atajo de /shop para los objetos de inventario; usa el mismo servicio de compra.
async function handleBuy(guild, userId, member, itemId) {
  if (!ids.includes(itemId)) return { error: '❌ Objeto no válido. Opciones: ' + ids.map(i => `\`${i}\``).join(', ') + '. Para más productos usa `/shop`.' };
  return runPurchase({ guild, userId, member, itemId });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Compra objetos de inventario (atajo de /shop).')
    .addStringOption(opt => opt.setName('objeto').setDescription('Objeto a comprar').setRequired(true)
      .addChoices(...INVENTORY_ITEMS.map(i => ({ name: label(i), value: i.id })))),
  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'Abre este comando en un servidor.', ephemeral: true });
    const result = await handleBuy(interaction.guild, interaction.user.id, interaction.member, interaction.options.getString('objeto'));
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message, args) {
    if (!message.guild) return message.reply('Abre este comando en un servidor.');
    if (!args[0]) return message.reply('❌ Debes especificar un objeto (ej. `&buy escudo`, `&buy cana`, `&buy congelador`). Más productos en `&shop`.');
    const result = await handleBuy(message.guild, message.author.id, message.member, args[0].toLowerCase());
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
