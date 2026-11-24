const { createEmbed, COLORS } = require('../../utils/ui');
const { SlashCommandBuilder, } = require('discord.js');
const { getBalance, addCoins, removeCoins, addBank, removeBank } = require('../../services/economy').economyService;
const { money, moved, withActor, safeBar } = require('../../utils/economyView');

async function handleBank(guildId, userId, subCommand, qtyStr, user = null) {
  const bal = getBalance(guildId, userId);
  
  if (subCommand === 'deposit' || subCommand === 'dep') {
    let amount = qtyStr === 'all' ? bal.coins : parseInt(qtyStr);
    if (isNaN(amount) || amount <= 0) return { error: '❌ Cantidad inválida.' };
    if (amount > bal.coins) return { error: `❌ No tienes suficientes monedas en la billetera. (Tienes ${bal.coins} 🪙)` };
    
    removeCoins(guildId, userId, amount);
    addBank(guildId, userId, amount);
    
    const newBal = getBalance(guildId, userId);
    
    const embed = withActor(createEmbed(COLORS.success), user, '🏦 Depósito exitoso')
      .setDescription(`📥 Pusiste ${money(amount)} a salvo en el banco.`)
      .addFields(
        { name: '👛 Billetera', value: moved(bal.coins, newBal.coins), inline: true },
        { name: '🏦 Banco', value: moved(bal.bank, newBal.bank), inline: true },
        { name: '🛡️ Dinero a salvo de robos', value: safeBar(newBal), inline: false }
      )
      .setFooter({ text: 'Solo la billetera se puede robar · /bank withdraw para retirar' })
      .setTimestamp();
      
    return { embed };
  } else if (subCommand === 'withdraw' || subCommand === 'with') {
    let amount = qtyStr === 'all' ? bal.bank : parseInt(qtyStr);
    if (isNaN(amount) || amount <= 0) return { error: '❌ Cantidad inválida.' };
    if (amount > bal.bank) return { error: `❌ No tienes esa cantidad en el banco. (Tienes ${bal.bank} 🪙)` };
    
    removeBank(guildId, userId, amount);
    addCoins(guildId, userId, amount);
    
    const newBal = getBalance(guildId, userId);
    
    const embed = withActor(createEmbed(COLORS.economy), user, '🏦 Retiro exitoso')
      .setDescription(`📤 Sacaste ${money(amount)} del banco, listas para usar.`)
      .addFields(
        { name: '👛 Billetera', value: moved(bal.coins, newBal.coins), inline: true },
        { name: '🏦 Banco', value: moved(bal.bank, newBal.bank), inline: true },
        { name: '🛡️ Dinero a salvo de robos', value: safeBar(newBal), inline: false }
      )
      .setFooter({ text: 'Recuerda: lo que está en la billetera se puede robar' })
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
    
    const result = await handleBank(interaction.guildId, interaction.user.id, sub, qtyStr, interaction.user);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message, args) {
    if (args.length < 2) return message.reply('❌ Uso correcto: `&bank deposit <cantidad>` o `&bank withdraw <cantidad>`. Usa `all` para todo.');
    const sub = args[0].toLowerCase();
    const qtyStr = args[1].toLowerCase();
    
    const result = await handleBank(message.guild.id, message.author.id, sub, qtyStr, message.author);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
