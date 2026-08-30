const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles } = require('../../utils/profileStore');

async function handleTransfer(guildId, userId, targetUser, cantidad) {
  if (!targetUser || targetUser.id === userId) {
    return { error: '❌ Debes elegir a otro usuario como destinatario.' };
  }
  if (targetUser.bot) {
    return { error: '❌ No puedes transferir monedas a un bot.' };
  }
  if (cantidad == null || cantidad < 1 || isNaN(cantidad)) {
    return { error: '❌ La cantidad debe ser mayor a 0.' };
  }
  const { coins } = getBalance(guildId, userId);
  if (coins < cantidad) {
    return { error: `❌ Fondos insuficientes. Tienes ${coins} 🪙.` };
  }
  if (!removeCoins(guildId, userId, cantidad)) {
    return { error: '❌ No se pudo procesar la transferencia.' };
  }
  
  addCoins(guildId, targetUser.id, cantidad);
  
  const profiles = readProfiles();
  writeProfiles(profiles);
  
  const bal = getBalance(guildId, userId).coins;
  
  const embed = new EmbedBuilder()
    .setColor(0x43b581)
    .setAuthor({ name: '💸 Transferencia Realizada' })
    .addFields(
      { name: '📤 Monto Enviado', value: `> **${cantidad.toLocaleString()} 🪙** a <@${targetUser.id}>`, inline: false },
      { name: '👛 Tu Nuevo Balance', value: `> **${bal.toLocaleString()} 🪙**`, inline: false }
    )
    .setFooter({ text: 'Transferencia exitosa' })
    .setTimestamp();
    
  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfiere monedas a otro usuario')
    .addUserOption(o => o
      .setName('destinatario')
      .setDescription('Usuario que recibirá las monedas')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('cantidad')
      .setDescription('Cantidad de monedas a transferir')
      .setRequired(true)
      .setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const destinatario = interaction.options.getUser('destinatario');
    const cantidad = interaction.options.getInteger('cantidad');
    
    const result = await handleTransfer(interaction.guildId, interaction.user.id, destinatario, cantidad);
    if (result.error) return interaction.editReply({ content: result.error });
    return interaction.editReply({ embeds: [result.embed] });
  },

  async executePrefix(message, args) {
    if (!message.guild || !message.member) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }
    let targetUser = null;
    let cantidad = null;
    if (message.mentions.users.size > 0) {
      targetUser = message.mentions.users.first();
      cantidad = parseInt(args[1], 10);
    } else if (args.length > 1) {
      const arg = args[0].replace(/[<@!>]/g, '');
      let user = message.guild.members.cache.get(arg)?.user;
      if (!user) {
        user = message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === arg.toLowerCase() ||
          m.user.tag.toLowerCase() === arg.toLowerCase()
        )?.user;
      }
      if (user) targetUser = user;
      cantidad = parseInt(args[1], 10);
    }
    
    const result = await handleTransfer(message.guild.id, message.author.id, targetUser, cantidad);
    if (result.error) return message.reply(result.error);
    return message.reply({ embeds: [result.embed] });
  }
};
