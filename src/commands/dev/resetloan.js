const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { resetLoan, getLoan } = require('../../services/economy/loanService');
const { isOwnerOrDev } = require('../../utils/staffAuth');
const { createErrorEmbed } = require('../../utils/embedFactory');

async function handleResetLoanCommand(guildId, executorId, targetUser) {
  if (!targetUser) {
    return { error: '❌ Especifica un usuario válido.' };
  }

  const loan = getLoan(guildId, targetUser.id);
  if (!loan || !loan.active) {
    return { error: `❌ El usuario <@${targetUser.id}> no tiene ningún préstamo activo ni deudas pendientes.` };
  }

  const result = resetLoan(guildId, targetUser.id);
  if (!result.success) {
    return { error: `❌ ${result.reason}` };
  }

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: '🛠️ Deuda de Préstamo Reiniciada — Developer Action' })
    .addFields(
      { name: '👤 Usuario Regularizado', value: `> <@${targetUser.id}> (${targetUser.tag || targetUser.username})`, inline: false },
      { name: '💸 Deuda Anulada', value: `> **${result.previousBalance.toLocaleString()} 🪙**`, inline: true },
      { name: '📋 Principal Original', value: `> **${result.previousPrincipal.toLocaleString()} 🪙**`, inline: true },
      { name: '🛡️ Estado', value: `> ✅ **Préstamo cancelado.** Se removieron penalizaciones e historial de deuda activa.`, inline: false },
      { name: '💻 Desarrollador', value: `> <@${executorId}>`, inline: false }
    )
    .setFooter({ text: 'Acción exclusiva de desarrollo (staffAuth)' })
    .setTimestamp();

  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetloan')
    .setDescription('Reinicia y cancela por completo la deuda de préstamo de un usuario (Exclusivo Dev).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuario cuya deuda de préstamo será reseteada')
        .setRequired(true)),

  async execute(interaction) {
    if (!isOwnerOrDev(interaction.user.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Desarrollador o Dueño** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en el archivo `.env` para obtener acceso.'
      );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const target = interaction.options.getUser('usuario');
    const result = await handleResetLoanCommand(interaction.guildId, interaction.user.id, target);

    if (result.error) {
      return interaction.reply({ content: result.error, ephemeral: true });
    }

    return interaction.reply({ embeds: [result.embed], ephemeral: true });
  },

  async executePrefix(message, args, client) {
    if (!isOwnerOrDev(message.author.id)) {
      const embed = createErrorEmbed(
        '⛔ Acceso Restringido',
        'Este comando es de uso **exclusivo para el Desarrollador o Dueño** del bot.\n' +
        'Configura `OWNER_ID` o `DEVELOPER_ID` en el archivo `.env` para obtener acceso.'
      );
      return message.reply({ embeds: [embed] });
    }

    if (!message.guild) {
      return message.reply('❌ Este comando solo puede usarse dentro de un servidor.');
    }

    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0]) {
      const cleanId = args[0].replace(/[<@!>]/g, '');
      targetUser = message.guild.members.cache.get(cleanId)?.user || await client.users.fetch(cleanId).catch(() => null);
    }

    if (!targetUser) {
      return message.reply('❌ Uso: `&resetloan @usuario` o `&resetloan <ID_usuario>`');
    }

    const result = await handleResetLoanCommand(message.guild.id, message.author.id, targetUser);
    if (result.error) {
      return message.reply(result.error);
    }

    return message.reply({ embeds: [result.embed] });
  }
};
