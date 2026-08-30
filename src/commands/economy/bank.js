const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins, addBank, removeBank } = require('../../services/economy').economyService;

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
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    
    const bal = getBalance(guildId, userId);
    
    if (sub === 'deposit') {
      let amount = qtyStr === 'all' ? bal.coins : parseInt(qtyStr);
      if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ Cantidad inválida.', ephemeral: true });
      if (amount > bal.coins) return interaction.reply({ content: `❌ No tienes suficientes monedas en la billetera. (Tienes ${bal.coins})`, ephemeral: true });
      
      removeCoins(guildId, userId, amount);
      addBank(guildId, userId, amount);
      
      const emb = new EmbedBuilder().setColor(0x57F287).setDescription(`🏦 Has depositado **${amount.toLocaleString()} 🪙** en el banco.\\n*Tus fondos ahora están seguros de robos.*`);
      await interaction.reply({ embeds: [emb] });
    } 
    else if (sub === 'withdraw') {
      let amount = qtyStr === 'all' ? bal.bank : parseInt(qtyStr);
      if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ Cantidad inválida.', ephemeral: true });
      if (amount > bal.bank) return interaction.reply({ content: `❌ No tienes esa cantidad en el banco. (Tienes ${bal.bank})`, ephemeral: true });
      
      removeBank(guildId, userId, amount);
      addCoins(guildId, userId, amount);
      
      const emb = new EmbedBuilder().setColor(0xF1C40F).setDescription(`🏦 Has retirado **${amount.toLocaleString()} 🪙** de tu banco a la billetera.`);
      await interaction.reply({ embeds: [emb] });
    }
  },
  async executePrefix(message, args) {
    if (args.length < 2) return message.reply('❌ Uso correcto: `&bank deposit <cantidad>` o `&bank withdraw <cantidad>`. Usa `all` para todo.');
    const sub = args[0].toLowerCase();
    const qtyStr = args[1].toLowerCase();
    const guildId = message.guild.id;
    const userId = message.author.id;
    
    const bal = getBalance(guildId, userId);
    
    if (sub === 'deposit' || sub === 'dep') {
      let amount = qtyStr === 'all' ? bal.coins : parseInt(qtyStr);
      if (isNaN(amount) || amount <= 0) return message.reply('❌ Cantidad inválida.');
      if (amount > bal.coins) return message.reply(`❌ No tienes suficientes monedas en la billetera. (Tienes ${bal.coins})`);
      
      removeCoins(guildId, userId, amount);
      addBank(guildId, userId, amount);
      
      const emb = new EmbedBuilder().setColor(0x57F287).setDescription(`🏦 Has depositado **${amount.toLocaleString()} 🪙** en el banco.\\n*Tus fondos ahora están seguros de robos.*`);
      await message.reply({ embeds: [emb] });
    } 
    else if (sub === 'withdraw' || sub === 'with') {
      let amount = qtyStr === 'all' ? bal.bank : parseInt(qtyStr);
      if (isNaN(amount) || amount <= 0) return message.reply('❌ Cantidad inválida.');
      if (amount > bal.bank) return message.reply(`❌ No tienes esa cantidad en el banco. (Tienes ${bal.bank})`);
      
      removeBank(guildId, userId, amount);
      addCoins(guildId, userId, amount);
      
      const emb = new EmbedBuilder().setColor(0xF1C40F).setDescription(`🏦 Has retirado **${amount.toLocaleString()} 🪙** de tu banco a la billetera.`);
      await message.reply({ embeds: [emb] });
    } else {
      return message.reply('❌ Subcomando no válido. Usa `deposit` o `withdraw`.');
    }
  }
};
