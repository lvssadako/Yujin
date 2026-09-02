const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { getLoan, recordLoanTransfer } = require('../../services/economy/loanService');
const { penalizeXp } = require('../../services/level/index').levelService;
const { readProfiles, writeProfiles } = require('../../utils/profileStore');

async function handleTransfer(guildId, userId, targetUser, cantidad) {
  if (!targetUser || targetUser.id === userId) {
    return { error: '❌ Debes elegir a otro usuario como destinatario (no puedes transferirte a ti mismo).' };
  }
  if (targetUser.bot) {
    return { error: '❌ No puedes transferir monedas a un bot.' };
  }
  if (cantidad == null || cantidad < 1 || isNaN(cantidad)) {
    return { error: '❌ La cantidad debe ser un número entero mayor a 0.' };
  }
  const { coins } = getBalance(guildId, userId);
  if (coins < cantidad) {
    return { error: `❌ Fondos insuficientes. Tienes **${coins.toLocaleString()} 🪙** en tu billetera.` };
  }
  if (!removeCoins(guildId, userId, cantidad)) {
    return { error: '❌ No se pudo procesar la transferencia.' };
  }
  
  addCoins(guildId, targetUser.id, cantidad);
  
  try {
    const profiles = readProfiles();
    writeProfiles(profiles);
  } catch {}
  
  const bal = getBalance(guildId, userId).coins;

  // Verificación de préstamo activo y aplicación de penalización de XP
  const loan = getLoan(guildId, userId);
  let loanWarning = null;

  if (loan && loan.active && loan.balance > 0) {
    // Penalización moderadamente alta: base 500 XP + 50% del monto transferido
    const penaltyXp = Math.max(500, Math.floor(cantidad * 0.5));
    const xpPenaltyResult = penalizeXp(guildId, userId, penaltyXp);
    const updatedLoan = recordLoanTransfer(guildId, userId, cantidad, penaltyXp);

    loanWarning = {
      penaltyXp,
      transferredTotal: updatedLoan?.transferredWithActiveLoan || cantidad,
      currentDebt: loan.balance,
      remainingXp: xpPenaltyResult.xp,
      currentLevel: xpPenaltyResult.level
    };
  }
  
  const embed = new EmbedBuilder()
    .setColor(loanWarning ? 0xFEE75C : 0x43b581)
    .setAuthor({ name: loanWarning ? '⚠️ Transferencia Realizada con Advertencia' : '💸 Transferencia Realizada' })
    .addFields(
      { name: '📤 Monto Enviado', value: `> **${cantidad.toLocaleString()} 🪙** a <@${targetUser.id}>`, inline: true },
      { name: '👛 Tu Nuevo Balance', value: `> **${bal.toLocaleString()} 🪙**`, inline: true }
    )
    .setFooter({ text: loanWarning ? 'Transferencia sujeta a penalización de préstamo' : 'Transferencia exitosa' })
    .setTimestamp();

  if (loanWarning) {
    embed.addFields({
      name: '⚠️ Advertencia: Préstamos Intransferibles y Penalización de XP',
      value:
        `> 🚫 **Los fondos de préstamos bancarios son personales y no pueden ser transferidos.**\n` +
        `> 📉 Has recibido una **penalización de XP moderadamente alta (-${loanWarning.penaltyXp.toLocaleString()} XP)** por transferir monedas mientras mantienes una deuda activa de **${loanWarning.currentDebt.toLocaleString()} 🪙**.\n` +
        `> 📊 Estado de nivel actual: Nivel **${loanWarning.currentLevel}** (${loanWarning.remainingXp.toLocaleString()} XP).\n` +
        `> ⏳ Registro acumulado en deuda: **${loanWarning.transferredTotal.toLocaleString()} 🪙**. Para normalizar tu cuenta, salda tu préstamo con \`/loan repay\`.`,
      inline: false
    });
  }
    
  return { embed };
}

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
    // Probar arg[0] como usuario y arg[1] como cantidad
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
  handleTransfer,
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfiere monedas a otro usuario.')
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
    
    const { targetUser, cantidad } = parseTargetAndAmount(message, args);

    if (!targetUser || !cantidad) {
      return message.reply('❌ Uso: `&transfer @usuario <cantidad>` o `&transfer <cantidad> @usuario`');
    }
    
    const result = await handleTransfer(message.guild.id, message.author.id, targetUser, cantidad);
    if (result.error) return message.reply(result.error);
    return message.reply({ embeds: [result.embed] });
  }
};
