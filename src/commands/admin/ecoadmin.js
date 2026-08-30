const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addCoins, removeCoins, getBalance } = require('../../services/economy').economyService;

async function handleEcoAdmin(guildId, subCommand, target, amount) {
  if (amount <= 0 || isNaN(amount)) return { error: '❌ La cantidad debe ser mayor a 0.' };
  
  if (subCommand === 'addmoney') {
    addCoins(guildId, target.id, amount);
    const newBal = getBalance(guildId, target.id);
    
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '✅ Fondos Añadidos' })
      .addFields(
        { name: '👤 Usuario', value: `> **${target.tag || target.username}**`, inline: false },
        { name: '📥 Cantidad Añadida', value: `> **${amount.toLocaleString()} 🪙**`, inline: false },
        { name: '👛 Nuevo Balance', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: false }
      )
      .setFooter({ text: 'Acción de administrador' })
      .setTimestamp();
      
    return { embed };
  } else if (subCommand === 'removemoney') {
    const success = removeCoins(guildId, target.id, amount);
    if (!success) {
      return { error: `❌ El usuario no tiene suficientes monedas en su billetera para quitarle ${amount}.` };
    }
    const newBal = getBalance(guildId, target.id);
    
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: '✅ Fondos Removidos' })
      .addFields(
        { name: '👤 Usuario', value: `> **${target.tag || target.username}**`, inline: false },
        { name: '📤 Cantidad Quitada', value: `> **${amount.toLocaleString()} 🪙**`, inline: false },
        { name: '👛 Nuevo Balance', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: false }
      )
      .setFooter({ text: 'Acción de administrador' })
      .setTimestamp();
      
    return { embed };
  } else {
    return { error: '❌ Subcomando inválido. Usa `addmoney` o `removemoney`.' };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ecoadmin')
    .setDescription('Administra la economía del servidor de forma manual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('addmoney').setDescription('Añade monedas a un usuario')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(opt => opt.setName('cantidad').setDescription('Monedas a dar').setRequired(true)))
    .addSubcommand(sub => sub.setName('removemoney').setDescription('Quita monedas de la billetera de un usuario')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(opt => opt.setName('cantidad').setDescription('Monedas a quitar').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    
    const result = await handleEcoAdmin(interaction.guildId, sub, target, amount);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ No tienes permiso para usar este comando.');
    if (args.length < 3) return message.reply('❌ Uso correcto: `&ecoadmin addmoney @usuario <cantidad>` o `&ecoadmin removemoney @usuario <cantidad>`.');
    
    const sub = args[0].toLowerCase();
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Debes mencionar a un usuario.');
    const amount = parseInt(args[2]);
    
    const result = await handleEcoAdmin(message.guild.id, sub, target, amount);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
