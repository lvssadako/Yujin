const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, getInventory } = require('../../services/economy').economyService;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bal')
    .setDescription('Revisa tu balance (Billetera y Banco) e inventario rápido.')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver el balance de otro usuario').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const bal = getBalance(interaction.guildId, target.id);
    const inv = getInventory(interaction.guildId, target.id);

    const invText = Object.keys(inv).length > 0 
      ? Object.entries(inv).map(([item, count]) => `> **${item}**: x${count}`).join('\n')
      : '> *Mochila vacía.*';

    const emb = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setAuthor({ name: `Estado de Cuenta de ${target.tag}`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '💰 Billetera (Wallet)', value: `**\`${bal.coins.toLocaleString()}\`** 🪙`, inline: true },
        { name: '🏦 Banco (Bank)', value: `**\`${bal.bank.toLocaleString()}\`** 🪙`, inline: true },
        { name: '💎 Total', value: `**\`${(bal.coins + bal.bank).toLocaleString()}\`** 🪙`, inline: true },
        { name: '🎒 Mochila', value: invText, inline: false }
      )
      .setFooter({ text: 'Usa /bank para guardar tus monedas y /inventory para ver items detallados.' })
      .setTimestamp();
      
    await interaction.reply({ embeds: [emb] });
  }
};
