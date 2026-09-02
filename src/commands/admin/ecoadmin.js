const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addCoins, removeCoins, getBalance } = require('../../services/economy').economyService;
const { isOwnerOrDev } = require('../../utils/staffAuth');

function isStaffOrMod(member) {
  if (!member) return false;
  if (isOwnerOrDev(member.id)) return true;
  return (
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    member.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions?.has(PermissionFlagsBits.ModerateMembers)
  );
}

async function handleEcoAdmin(guildId, executorId, subCommand, target, amount) {
  if (!target) return { error: '❌ Debes especificar un usuario válido.' };
  if (amount <= 0 || isNaN(amount)) return { error: '❌ La cantidad debe ser un número entero mayor a 0.' };
  
  if (subCommand === 'addmoney') {
    if (target.id === executorId) {
      return { error: '❌ No puedes darte dinero a ti mismo usando comandos de administración.' };
    }
    if (target.bot) {
      return { error: '❌ No puedes dar monedas a un bot.' };
    }

    addCoins(guildId, target.id, amount);
    const newBal = getBalance(guildId, target.id);
    
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '✅ Fondos Añadidos por Staff' })
      .addFields(
        { name: '👤 Usuario', value: `> <@${target.id}> (${target.tag || target.username})`, inline: false },
        { name: '📥 Cantidad Añadida', value: `> **+${amount.toLocaleString()} 🪙**`, inline: true },
        { name: '👛 Nuevo Balance', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: true },
        { name: '🛡️ Autorizado por', value: `> <@${executorId}>`, inline: false }
      )
      .setFooter({ text: 'Acción de administración' })
      .setTimestamp();
      
    return { embed };
  } else if (subCommand === 'removemoney') {
    const success = removeCoins(guildId, target.id, amount);
    if (!success) {
      return { error: `❌ El usuario no tiene suficientes monedas en su billetera para quitarle ${amount.toLocaleString()} 🪙.` };
    }
    const newBal = getBalance(guildId, target.id);
    
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: '✅ Fondos Removidos por Staff' })
      .addFields(
        { name: '👤 Usuario', value: `> <@${target.id}> (${target.tag || target.username})`, inline: false },
        { name: '📤 Cantidad Quitada', value: `> **-${amount.toLocaleString()} 🪙**`, inline: true },
        { name: '👛 Nuevo Balance', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: true },
        { name: '🛡️ Autorizado por', value: `> <@${executorId}>`, inline: false }
      )
      .setFooter({ text: 'Acción de administración' })
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub => sub.setName('addmoney').setDescription('Añade monedas a un usuario (no puedes ser tú mismo)')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(opt => opt.setName('cantidad').setDescription('Monedas a dar').setRequired(true)))
    .addSubcommand(sub => sub.setName('removemoney').setDescription('Quita monedas de la billetera de un usuario')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(opt => opt.setName('cantidad').setDescription('Monedas a quitar').setRequired(true))),
  async execute(interaction) {
    if (!isStaffOrMod(interaction.member)) {
      return interaction.reply({ content: '❌ No tienes permisos para usar este comando.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    
    const result = await handleEcoAdmin(interaction.guildId, interaction.user.id, sub, target, amount);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message, args) {
    if (!message.guild || !message.member) {
      return message.reply('❌ Este comando solo puede usarse en un servidor.');
    }

    if (!isStaffOrMod(message.member)) {
      return message.reply('❌ No tienes permisos para usar este comando.');
    }
    if (args.length < 3) return message.reply('❌ Uso correcto: `&ecoadmin addmoney @usuario <cantidad>` o `&ecoadmin removemoney @usuario <cantidad>`.');
    
    const sub = args[0].toLowerCase();
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Debes mencionar a un usuario.');
    const amount = parseInt(args[2], 10);
    
    const result = await handleEcoAdmin(message.guild.id, message.author.id, sub, target, amount);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
