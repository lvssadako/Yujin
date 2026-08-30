const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins, addBank, removeBank } = require('../../services/economy').economyService;

async function handleBank(guildId, userId, subCommand, qtyStr) {
  const bal = getBalance(guildId, userId);
  
  if (subCommand === 'deposit' || subCommand === 'dep') {
    let amount = qtyStr === 'all' ? bal.coins : parseInt(qtyStr);
    if (isNaN(amount) || amount <= 0) return { error: '❌ Cantidad inválida.' };
    if (amount > bal.coins) return { error: `❌ No tienes suficientes monedas en la billetera. (Tienes ${bal.coins} 🪙)` };
    
    removeCoins(guildId, userId, amount);
    addBank(guildId, userId, amount);
    
    const newBal = getBalance(guildId, userId);
    
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '🏦 Depósito Exitoso' })
      .addFields(
        { name: '📥 Monto Depositado', value: `> **${amount.toLocaleString()} 🪙**`, inline: false },
        { name: '👛 Billetera', value: `> **${newBal.coins} 🪙**`, inline: false },
        { name: '🏦 Banco', value: `> **${newBal.bank} 🪙**`, inline: false }
      )
      .setFooter({ text: 'Tus fondos ahora están seguros' })
      .setTimestamp();
      
    return { embed };
  } else if (subCommand === 'withdraw' || subCommand === 'with') {
    let amount = qtyStr === 'all' ? bal.bank : parseInt(qtyStr);
    if (isNaN(amount) || amount <= 0) return { error: '❌ Cantidad inválida.' };
    if (amount > bal.bank) return { error: `❌ No tienes esa cantidad en el banco. (Tienes ${bal.bank} 🪙)` };
    
    removeBank(guildId, userId, amount);
    addCoins(guildId, userId, amount);
    
    const newBal = getBalance(guildId, userId);
    
    const embed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setAuthor({ name: '🏦 Retiro Exitoso' })
      .addFields(
        { name: '📤 Monto Retirado', value: `> **${amount.toLocaleString()} 🪙**`, inline: false },
        { name: '👛 Billetera', value: `> **${newBal.coins} 🪙**`, inline: false },
        { name: '🏦 Banco', value: `> **${newBal.bank} 🪙**`, inline: false }
      )
      .setFooter({ text: 'Fondos listos para usar' })
      .setTimestamp();
      
    return { embed };
  } else {
    return { error: '❌ Subcomando no válido. Usa `deposit` o `withdraw`.' };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bank')
    .setDescription('Sistema Bancario: Deposita o retira monedas para mantenerlas a salvo de robos.')
    .addSubcommand(sub => sub.setName('deposit').setDescription('Deposita dinero al banco')
      .addStringOption(opt => opt.setName('cantidad').setDescription('Cantidad (o "all" para todo)').setRequired(true)))
    .addSubcommand(sub => sub.setName('withdraw').setDescription('Retira dinero del banco a la billetera')
      .addStringOption(opt => opt.setName('cantidad').setDescription('Cantidad (o "all" para todo)').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const qtyStr = interaction.options.getString('cantidad').toLowerCase();
    
    const result = await handleBank(interaction.guildId, interaction.user.id, sub, qtyStr);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message, args) {
    if (args.length < 2) return message.reply('❌ Uso correcto: `&bank deposit <cantidad>` o `&bank withdraw <cantidad>`. Usa `all` para todo.');
    const sub = args[0].toLowerCase();
    const qtyStr = args[1].toLowerCase();
    
    const result = await handleBank(message.guild.id, message.author.id, sub, qtyStr);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
