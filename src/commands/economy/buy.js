const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, removeCoins, addItem } = require('../../services/economy').economyService;

const ITEMS = {
  'escudo': { name: '🛡️ Escudo Anti-Robo', price: 5000, id: 'escudo', desc: 'Te protege automáticamente de un intento de robo.' },
  'cana': { name: '🎣 Caña de Pescar', price: 2000, id: 'cana', desc: 'Desbloquea el comando /fish para pescar tesoros.' }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Tienda de Objetos Físicos (Inventario).')
    .addStringOption(opt => opt.setName('objeto').setDescription('Objeto a comprar').setRequired(true)
      .addChoices(
        { name: '🛡️ Escudo Anti-Robo (5,000 🪙)', value: 'escudo' },
        { name: '🎣 Caña de Pescar (2,000 🪙)', value: 'cana' }
      )),
  async execute(interaction) {
    const itemId = interaction.options.getString('objeto');
    const item = ITEMS[itemId];
    
    const bal = getBalance(interaction.guildId, interaction.user.id);
    if (bal.coins < item.price) {
      return interaction.reply({ content: `❌ No tienes suficientes monedas en la billetera. Cuesta **${item.price} 🪙**.`, ephemeral: true });
    }
    
    removeCoins(interaction.guildId, interaction.user.id, item.price);
    addItem(interaction.guildId, interaction.user.id, item.id, 1);
    
    const emb = new EmbedBuilder().setColor(0x57F287)
      .setTitle('🛍️ Compra Exitosa')
      .setDescription(`Has comprado **${item.name}** por **${item.price} 🪙**.\\n> *${item.desc}*`);
    await interaction.reply({ embeds: [emb] });
  }
};
