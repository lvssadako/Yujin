const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { takeLoan, repayLoan, getUserLoanSummary } = require('../../services/economy/loanService');

// ─── Constantes de penalización ───────────────────────────────────────────────

const PENALTY_INFO = [
  { emoji: '✅', label: 'Sin penalización',                          color: 0x57F287 },
  { emoji: '⚠️', label: 'Advertencia — deuda creciente (>= 1.5x)',   color: 0xF1C40F },
  { emoji: '🔶', label: 'Penalización media — Trabajo/Pesca al 50% (>= 2.0x)', color: 0xE67E22 },
  { emoji: '🔴', label: 'Penalización severa — Trabajo/Pesca al 25% (techo 2.5x)', color: 0xED4245 }
];

// ─── Subcomando: take ─────────────────────────────────────────────────────────

async function handleTake(guildId, userId, amountStr) {
  const amount = parseInt(amountStr, 10);
  if (isNaN(amount) || amount <= 0) {
    return { error: '❌ Especifica una cantidad válida (entre 500 y 100,000 🪙).' };
  }

  const result = takeLoan(guildId, userId, amount);
  if (!result.success) {
    return { error: `❌ ${result.reason}` };
  }

  // Acreditar el dinero en la billetera del usuario
  addCoins(guildId, userId, amount);
  const newBal = getBalance(guildId, userId);

  const initialInterest = result.initialInterest || Math.ceil(amount * 0.05);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: '🏦 Préstamo Aprobado' })
    .addFields(
      { name: '💵 Monto Recibido', value: `> **${amount.toLocaleString()} 🪙**`, inline: true },
      { name: '🏷️ Interés Inicial (Apertura)', value: `> **${initialInterest.toLocaleString()} 🪙** *(5%)*`, inline: true },
      { name: '📈 Deuda Inicial Total', value: `> **${result.loan.balance.toLocaleString()} 🪙**`, inline: true },
      { name: '📊 Tasa Diaria Inicial', value: `> **5%** diario`, inline: true },
      { name: '👛 Tu Billetera Ahora', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: true },
      {
        name: '⚠️ Condiciones y Advertencia de Transferencia',
        value:
          '> • El interés se aplica **cada 24 horas** y aumenta gradualmente con los días.\n' +
          '> • 🚫 **No transferible:** Los fondos de préstamos son personales. Transferir fondos teniendo deuda activa incurrirá en una **penalización de XP moderadamente alta**.\n' +
          '> • 🛡️ **Techo de deuda:** Máximo **2.5x** del préstamo original.\n' +
          '> • Usa `/loan repay` para hacer pagos y `/loan status` para consultar tu estado.',
        inline: false
      }
    )
    .setFooter({ text: 'Paga a tiempo para evitar penalizaciones e intereses crecientes.' })
    .setTimestamp();

  return { embed };
}

// ─── Subcomando: repay ────────────────────────────────────────────────────────

async function handleRepay(guildId, userId, amountStr) {
  const summary = getUserLoanSummary(guildId, userId);
  if (!summary.active) {
    return { error: '✅ No tienes préstamos activos. ¡Estás libre de deudas!' };
  }

  const bal = getBalance(guildId, userId);

  let amount;
  if (amountStr === 'all' || amountStr === 'todo') {
    amount = Math.min(bal.coins, summary.balance);
  } else {
    amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      return { error: '❌ Especifica una cantidad válida o usa `all` para pagar todo.' };
    }
  }

  if (amount > bal.coins) {
    return { error: `❌ No tienes suficientes monedas. Tienes **${bal.coins.toLocaleString()} 🪙** y la deuda es **${summary.balance.toLocaleString()} 🪙**.` };
  }

  if (amount <= 0) {
    return { error: '❌ No tienes monedas para pagar.' };
  }

  // Descontar monedas
  const removed = removeCoins(guildId, userId, amount);
  if (!removed) {
    return { error: '❌ No se pudo procesar el pago. Fondos insuficientes.' };
  }

  const result = repayLoan(guildId, userId, amount);
  if (!result.success) {
    // Revertir el pago si algo falló en repayLoan (no debería ocurrir)
    addCoins(guildId, userId, amount);
    return { error: `❌ ${result.reason}` };
  }

  const newBal = getBalance(guildId, userId);

  if (result.cleared) {
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '🎉 ¡Préstamo Pagado Completamente!' })
      .addFields(
        { name: '💸 Pago Realizado', value: `> **${result.paid.toLocaleString()} 🪙**`, inline: true },
        { name: '👛 Balance Restante', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: true },
        { name: '🏆 Estado', value: `> ✅ **Libre de deudas.** ¡Felicitaciones!`, inline: false }
      )
      .setFooter({ text: '¡Ya puedes solicitar otro préstamo si lo necesitas!' })
      .setTimestamp();
    return { embed };
  }

  const penInfo = PENALTY_INFO[result.penaltyLevel] || PENALTY_INFO[0];
  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setAuthor({ name: '💳 Pago Parcial Registrado' })
    .addFields(
      { name: '💸 Pago Realizado', value: `> **${result.paid.toLocaleString()} 🪙**`, inline: true },
      { name: '📉 Deuda Restante', value: `> **${result.remaining.toLocaleString()} 🪙**`, inline: true },
      { name: '👛 Tu Balance', value: `> **${newBal.coins.toLocaleString()} 🪙**`, inline: true },
      { name: `${penInfo.emoji} Estado Actual`, value: `> ${penInfo.label}`, inline: false }
    )
    .setFooter({ text: 'Sigue pagando para reducir intereses y penalizaciones.' })
    .setTimestamp();

  return { embed };
}

// ─── Subcomando: status ───────────────────────────────────────────────────────

async function handleStatus(guildId, userId) {
  const summary = getUserLoanSummary(guildId, userId);

  if (!summary.active) {
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '🏦 Estado del Préstamo' })
      .setDescription('> ✅ **Sin deudas activas.** ¡Estás libre!')
      .setFooter({ text: 'Usa /loan take para solicitar un préstamo.' })
      .setTimestamp();
    return { embed };
  }

  const penInfo = PENALTY_INFO[summary.penaltyLevel] || PENALTY_INFO[0];
  const debtRatio = summary.principal > 0 ? (summary.balance / summary.principal).toFixed(2) : '—';
  const hoursToNext = Math.max(0, Math.ceil((summary.msUntilNextTick || 0) / (60 * 60 * 1000)));

  const fields = [
    { name: '📋 Principal Original', value: `> **${summary.principal.toLocaleString()} 🪙**`, inline: true },
    { name: '🏷️ Interés Inicial', value: `> **${(summary.initialInterest || 0).toLocaleString()} 🪙**`, inline: true },
    {
      name: '📈 Deuda Actual',
      value: `> **${summary.balance.toLocaleString()} 🪙** *(x${debtRatio})*${summary.isCapped ? ' 🔒 *(Tope)*' : ''}`,
      inline: true
    },
    { name: '💹 Tasa de Interés', value: `> **${(summary.interestRate * 100).toFixed(0)}%** diario`, inline: true },
    { name: '📅 Días Transcurridos', value: `> **${summary.tickCount}** día${summary.tickCount !== 1 ? 's' : ''}`, inline: true },
    {
      name: '⏰ Próximo Cobro',
      value: summary.isCapped ? '> 🔒 **Intereses congelados** (tope alcanzado)' : `> En aprox. **${hoursToNext}h**`,
      inline: true
    },
    {
      name: '🛡️ Techo Máximo',
      value: `> **${summary.maxBalance.toLocaleString()} 🪙** *(x2.5)*`,
      inline: true
    },
    {
      name: `${penInfo.emoji} Penalización de Ingresos`,
      value: `> **Nivel ${summary.penaltyLevel}:** ${penInfo.label}`,
      inline: false
    }
  ];

  if (summary.transferredWithActiveLoan > 0) {
    fields.push({
      name: '⚠️ Transferencias Registradas en Deuda',
      value: `> Has transferido **${summary.transferredWithActiveLoan.toLocaleString()} 🪙** teniendo este préstamo activo.\n> Penalización acumulada: **-${(summary.xpPenaltyApplied || 0).toLocaleString()} XP**.`,
      inline: false
    });
  }

  if (!summary.isCapped) {
    fields.push({
      name: '📊 Próxima Tasa',
      value: getNextRateInfo(summary.tickCount),
      inline: false
    });
  }

  const embed = new EmbedBuilder()
    .setColor(summary.isCapped ? 0xED4245 : penInfo.color)
    .setAuthor({ name: '🏦 Estado del Préstamo' })
    .addFields(fields)
    .setFooter({ text: 'Usa /loan repay <cantidad|all> para realizar un pago.' })
    .setTimestamp();

  return { embed };
}

function getNextRateInfo(tickCount) {
  if (tickCount < 3)  return `> En **${3 - tickCount}** día${3 - tickCount !== 1 ? 's' : ''}, la tasa subirá al **8%**.`;
  if (tickCount < 6)  return `> En **${6 - tickCount}** día${6 - tickCount !== 1 ? 's' : ''}, la tasa subirá al **12%**.`;
  if (tickCount < 10) return `> En **${10 - tickCount}** día${10 - tickCount !== 1 ? 's' : ''}, la tasa subirá al **18%**.`;
  return '> Has alcanzado la **tasa máxima del 18%** diario. ¡Paga cuanto antes!';
}

// ─── Módulo de comando ────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loan')
    .setDescription('Sistema de préstamos bancarios con interés variable y penalizaciones.')
    .addSubcommand(sub =>
      sub.setName('take')
        .setDescription('Solicita un préstamo (500 – 100,000 🪙)')
        .addIntegerOption(opt =>
          opt.setName('cantidad')
            .setDescription('Monto a solicitar')
            .setRequired(true)
            .setMinValue(500)
            .setMaxValue(100000)
        )
    )
    .addSubcommand(sub =>
      sub.setName('repay')
        .setDescription('Realiza un pago a tu préstamo')
        .addStringOption(opt =>
          opt.setName('cantidad')
            .setDescription('Monto a pagar o "all" para pagar todo')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('Consulta el estado de tu préstamo actual')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    let result;
    if (sub === 'take') {
      const cantidad = interaction.options.getInteger('cantidad');
      result = await handleTake(guildId, userId, cantidad.toString());
    } else if (sub === 'repay') {
      const cantidad = interaction.options.getString('cantidad').toLowerCase().trim();
      result = await handleRepay(guildId, userId, cantidad);
    } else if (sub === 'status') {
      result = await handleStatus(guildId, userId);
    } else {
      return interaction.reply({ content: '❌ Subcomando no reconocido.', ephemeral: true });
    }

    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    return interaction.reply({ embeds: [result.embed] });
  },

  async executePrefix(message, args) {
    const sub = (args[0] || '').toLowerCase();
    const guildId = message.guild.id;
    const userId = message.author.id;

    let result;
    if (sub === 'take' || sub === 'pedir') {
      result = await handleTake(guildId, userId, args[1]);
    } else if (sub === 'repay' || sub === 'pagar') {
      result = await handleRepay(guildId, userId, (args[1] || '').toLowerCase());
    } else if (sub === 'status' || sub === 'estado') {
      result = await handleStatus(guildId, userId);
    } else {
      return message.reply('❌ Uso: `&loan take <cantidad>`, `&loan repay <cantidad|all>`, `&loan status`');
    }

    if (result.error) return message.reply(result.error);
    return message.reply({ embeds: [result.embed] });
  }
};
