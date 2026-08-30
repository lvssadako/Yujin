const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, getInventory } = require('../../services/economy').economyService;

async function renderBalance(guildId, target) {
    const bal = getBalance(guildId, target.id);
    const inv = getInventory(guildId, target.id);
    const invText = Object.keys(inv).length > 0 
      ? Object.entries(inv).map(([item, count]) => `> **${item}**: x${count}`).join('\n')
      : '> *Mochila vacía.*';

    return new EmbedBuilder()
      .setColor(0xF1C40F)
      .setAuthor({ name: `Estado de Cuenta de ${target.tag}`, iconURL: target.displayAvatarURL() })
      .addFields(
        { name: '💰 Billetera', value: `**\`${bal.coins.toLocaleString()}\`** 🪙`, inline: true },
        { name: '🏦 Banco', value: `**\`${bal.bank.toLocaleString()}\`** 🪙`, inline: true },
        { name: '💎 Total', value: `**\`${(bal.coins + bal.bank).toLocaleString()}\`** 🪙`, inline: true },
        { name: '🎒 Mochila', value: invText, inline: false }
      )
      .setFooter({ text: 'Usa /bank para guardar dinero y /buy para objetos.' })
      .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Revisa tu balance (Billetera y Banco) e inventario rápido.')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver el balance de otro usuario').setRequired(false)),
  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const emb = await renderBalance(interaction.guildId, target);
    await interaction.reply({ embeds: [emb] });
  },
  async executePrefix(message, args, client) {
    let target = message.author;
    if (message.mentions.users.size > 0) target = message.mentions.users.first();
    const emb = await renderBalance(message.guild.id, target);
    await message.reply({ embeds: [emb] });
  }
};