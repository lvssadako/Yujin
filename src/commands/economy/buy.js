const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, removeCoins, addItem } = require('../../services/economy').economyService;

const ITEMS = {
  'escudo': { name: '🛡️ Escudo Anti-Robo', price: 5000, id: 'escudo', desc: 'Te protege automáticamente de un intento de robo.' },
  'cana': { name: '🎣 Caña de Pescar', price: 2000, id: 'cana', desc: 'Desbloquea el comando /fish para pescar tesoros.' },
  'congelador': { name: '🧊 Congelador de Racha', price: 3500, id: 'congelador', desc: 'Salva automáticamente tu racha si olvidas chatear un día.' }
};

async function handleBuy(guildId, userId, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { error: '❌ Objeto no válido. Opciones: `escudo`, `cana`, `congelador`.' };
  
  const bal = getBalance(guildId, userId);
  if (bal.coins < item.price) {
    return { error: `❌ No tienes suficientes monedas en la billetera. Cuesta **${item.price.toLocaleString()} 🪙**.` };
  }
  
  removeCoins(guildId, userId, item.price);
  addItem(guildId, userId, item.id, 1);
  
  const newBal = getBalance(guildId, userId);
  
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: '🛍️ Compra Exitosa' })
    .addFields(
      { name: '📦 Objeto Adquirido', value: `> **${item.name}**\n> *${item.desc}*`, inline: false },
      { name: '💸 Costo', value: `> **${item.price.toLocaleString()} 🪙**`, inline: false },
      { name: '👛 Balance Restante', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: false }
    )
    .setFooter({ text: '¡Gracias por tu compra!' })
    .setTimestamp();
    
  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Tienda de Objetos Físicos (Inventario).')
    .addStringOption(opt => opt.setName('objeto').setDescription('Objeto a comprar').setRequired(true)
      .addChoices(
        { name: '🛡️ Escudo Anti-Robo (5,000 🪙)', value: 'escudo' },
        { name: '🎣 Caña de Pescar (2,000 🪙)', value: 'cana' },
        { name: '🧊 Congelador de Racha (3,500 🪙)', value: 'congelador' }
      )),
  async execute(interaction) {
    const itemId = interaction.options.getString('objeto');
    const result = await handleBuy(interaction.guildId, interaction.user.id, itemId);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message, args) {
    if (!args[0]) return message.reply('❌ Debes especificar un objeto (ej. `&buy escudo`, `&buy cana`, `&buy congelador`).');
    const itemId = args[0].toLowerCase();
    const result = await handleBuy(message.guild.id, message.author.id, itemId);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
