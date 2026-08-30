const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../../services/economy').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../../utils/profileStore');

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
    await interaction.deferReply({ ephemeral: true });
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const destinatario = interaction.options.getUser('destinatario');
    const cantidad = interaction.options.getInteger('cantidad');

    if (!destinatario || destinatario.id === userId) {
      return interaction.editReply('❌ Debes elegir a otro usuario como destinatario.');
    }
    if (destinatario.bot) {
      return interaction.editReply('❌ No puedes transferir monedas a un bot.');
    }
    if (cantidad == null || cantidad < 1) {
      return interaction.editReply('❌ La cantidad debe ser mayor a 0.');
    }
    const { coins } = getBalance(guildId, userId);
    if (coins < cantidad) {
      return interaction.editReply(`❌ Fondos insuficientes. Tienes ${coins} 🪙.`);
    }
    if (!removeCoins(guildId, userId, cantidad)) {
      return interaction.editReply('❌ No se pudo procesar la transferencia.');
    }
    addCoins(guildId, destinatario.id, cantidad);
    const profiles = readProfiles();
    writeProfiles(profiles);
    const bal = getBalance(guildId, userId).coins;
    const embed = new EmbedBuilder()
      .setColor(0x43b581)
      .setTitle('💸 Transferencia realizada')
      .setDescription(`Has transferido **${cantidad} 🪙** a <@${destinatario.id}>.`)
      .addFields(
        { name: 'Tu nuevo balance', value: `${bal} 🪙`, inline: true }
      )
      .setFooter({ text: 'Transferencia entre usuarios' });
    return interaction.editReply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    if (!message.guild || !message.member) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }
    let targetUser = null;
    let cantidad = null;
    if (message.mentions.users.size > 0) {
      targetUser = message.mentions.users.first();
      cantidad = parseInt(args[1], 10);
    } else if (args.length > 1) {
      // Buscar por ID o nombre
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
    if (!targetUser || targetUser.id === message.author.id) {
      return message.reply('❌ Debes elegir a otro usuario como destinatario.');
    }
    if (targetUser.bot) {
      return message.reply('❌ No puedes transferir monedas a un bot.');
    }
    if (isNaN(cantidad) || cantidad < 1) {
      return message.reply('❌ La cantidad debe ser mayor a 0.');
    }
    const { coins } = getBalance(message.guild.id, message.author.id);
    if (coins < cantidad) {
      return message.reply(`❌ Fondos insuficientes. Tienes ${coins} 🪙.`);
    }
    if (!removeCoins(message.guild.id, message.author.id, cantidad)) {
      return message.reply('❌ No se pudo procesar la transferencia.');
    }
    addCoins(message.guild.id, targetUser.id, cantidad);
    const profiles = readProfiles();
    writeProfiles(profiles);
    const bal = getBalance(message.guild.id, message.author.id).coins;
    return message.reply(`💸 Has transferido **${cantidad} 🪙** a ${targetUser.username}. Tu nuevo balance: **${bal} 🪙**`);
  }
};
