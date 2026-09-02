const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addCoins, getBalance } = require('../../services/economy').economyService;
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

async function handleStaffAddMoney(guildId, executorId, targetUser, amount) {
  if (!targetUser) {
    return { error: '❌ Debes especificar un usuario válido.' };
  }

  // REGLA: No se puede dar dinero a quien ejecuta el comando
  if (targetUser.id === executorId) {
    return { error: '❌ No puedes otorgarte dinero a ti mismo. Este comando es de uso exclusivo para premiar u otorgar fondos a otros usuarios del servidor.' };
  }

  if (targetUser.bot) {
    return { error: '❌ No puedes otorgar monedas a un bot.' };
  }

  const safeAmount = Math.floor(Number(amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    return { error: '❌ La cantidad debe ser un número entero mayor a 0.' };
  }

  addCoins(guildId, targetUser.id, safeAmount);
  const newBal = getBalance(guildId, targetUser.id);

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: '🎁 Fondos Otorgados por Staff' })
    .addFields(
      { name: '👤 Destinatario', value: `> <@${targetUser.id}> (${targetUser.tag || targetUser.username})`, inline: false },
      { name: '💰 Cantidad Añadida', value: `> **+${safeAmount.toLocaleString()} 🪙**`, inline: true },
      { name: '👛 Nuevo Balance', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: true },
      { name: '🛡️ Autorizado por', value: `> <@${executorId}>`, inline: false }
    )
    .setFooter({ text: 'Acción administrativa de economía' })
    .setTimestamp();

  return { embed };
}

function parseTargetAndAmount(message, args) {
  let targetUser = null;
  let amount = null;

  if (message.mentions.users.size > 0) {
    targetUser = message.mentions.users.first();
    const otherArgs = args.filter(a => !a.includes(targetUser.id));
    for (const arg of otherArgs) {
      const parsed = parseInt(arg, 10);
      if (!isNaN(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  } else if (args.length >= 2) {
    const parsedAmount1 = parseInt(args[1], 10);
    const parsedAmount0 = parseInt(args[0], 10);

    if (!isNaN(parsedAmount1) && parsedAmount1 > 0) {
      amount = parsedAmount1;
      const userArg = args[0].replace(/[<@!>]/g, '');
      targetUser = message.guild.members.cache.get(userArg)?.user ||
        message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === userArg.toLowerCase() ||
          m.user.tag.toLowerCase() === userArg.toLowerCase()
        )?.user;
    } else if (!isNaN(parsedAmount0) && parsedAmount0 > 0) {
      amount = parsedAmount0;
      const userArg = args[1].replace(/[<@!>]/g, '');
      targetUser = message.guild.members.cache.get(userArg)?.user ||
        message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === userArg.toLowerCase() ||
          m.user.tag.toLowerCase() === userArg.toLowerCase()
        )?.user;
    }
  }

  return { targetUser, amount };
}

module.exports = {
  handleStaffAddMoney,
  data: new SlashCommandBuilder()
    .setName('addmoney')
    .setDescription('Otorga monedas a un usuario (Exclusivo para Administradores y Moderadores).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario al que se le añadirán las monedas (no puedes ser tú mismo)')
        .setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('cantidad')
        .setDescription('Cantidad de monedas a otorgar')
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    if (!isStaffOrMod(interaction.member)) {
      return interaction.reply({
        content: '❌ No tienes permisos de administración o moderación para usar este comando.',
        ephemeral: true
      });
    }

    const target = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');

    const result = await handleStaffAddMoney(interaction.guildId, interaction.user.id, target, amount);
    if (result.error) {
      return interaction.reply({ content: result.error, ephemeral: true });
    }

    return interaction.reply({ embeds: [result.embed] });
  },

  async executePrefix(message, args) {
    if (!message.guild || !message.member) {
      return message.reply('❌ Este comando solo puede usarse en un servidor.');
    }

    if (!isStaffOrMod(message.member)) {
      return message.reply('❌ No tienes permisos de administración o moderación para usar este comando.');
    }

    const { targetUser, amount } = parseTargetAndAmount(message, args);

    if (!targetUser || !amount) {
      return message.reply('❌ Uso: `&addmoney @usuario <cantidad>` o `&addmoney <cantidad> @usuario`');
    }

    const result = await handleStaffAddMoney(message.guild.id, message.author.id, targetUser, amount);
    if (result.error) {
      return message.reply(result.error);
    }

    return message.reply({ embeds: [result.embed] });
  }
};
