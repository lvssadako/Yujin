const { SlashCommandBuilder } = require('discord.js');
const { handleTransfer } = require('./transfer');

function parseTargetAndAmount(message, args) {
  let targetUser = null;
  let cantidad = null;

  if (message.mentions.users.size > 0) {
    targetUser = message.mentions.users.first();
    const otherArgs = args.filter(a => !a.includes(targetUser.id));
    for (const arg of otherArgs) {
      const parsed = parseInt(arg, 10);
      if (!isNaN(parsed) && parsed > 0) {
        cantidad = parsed;
        break;
      }
    }
  } else if (args.length >= 2) {
    const parsedAmount1 = parseInt(args[1], 10);
    const parsedAmount0 = parseInt(args[0], 10);

    if (!isNaN(parsedAmount1) && parsedAmount1 > 0) {
      cantidad = parsedAmount1;
      const userArg = args[0].replace(/[<@!>]/g, '');
      targetUser = message.guild.members.cache.get(userArg)?.user ||
        message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === userArg.toLowerCase() ||
          m.user.tag.toLowerCase() === userArg.toLowerCase()
        )?.user;
    } else if (!isNaN(parsedAmount0) && parsedAmount0 > 0) {
      cantidad = parsedAmount0;
      const userArg = args[1].replace(/[<@!>]/g, '');
      targetUser = message.guild.members.cache.get(userArg)?.user ||
        message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === userArg.toLowerCase() ||
          m.user.tag.toLowerCase() === userArg.toLowerCase()
        )?.user;
    }
  }

  return { targetUser, cantidad };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Paga o envía monedas de tu billetera a otro usuario.')
    .addUserOption(o => o
      .setName('destinatario')
      .setDescription('Usuario que recibirá las monedas')
      .setRequired(true))
    .addIntegerOption(o => o
      .setName('cantidad')
      .setDescription('Cantidad de monedas a pagar')
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
    
    const { targetUser, cantidad } = parseTargetAndAmount(message, args);

    if (!targetUser || !cantidad) {
      return message.reply('❌ Uso: `&pay @usuario <cantidad>` o `&pay <cantidad> @usuario`');
    }
    
    const result = await handleTransfer(message.guild.id, message.author.id, targetUser, cantidad);
    if (result.error) return message.reply(result.error);
    return message.reply({ embeds: [result.embed] });
  }
};
