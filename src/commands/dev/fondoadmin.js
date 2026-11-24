const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../../utils/ui');
const { createErrorEmbed } = require('../../utils/embedFactory');
const { isOwnerOrDev } = require('../../utils/staffAuth');
const { PROFILE_BG_PRODUCT_ID } = require('../../constants/paymentCatalog');
const payments = require('../../services/payments/paymentsService');
const { getProfileBackgroundService } = require('../../services/profile/profileBackgroundService');

const DENIED = () => createErrorEmbed('⛔ Acceso Restringido', 'Este comando es de uso **exclusivo para el Desarrollador o Dueño** del bot.');

async function run(guild, executorId, sub, targetId) {
  if (!/^\d{5,25}$/.test(String(targetId || ''))) return { content: '❌ Indica un usuario válido (mención o ID).' };
  const store = payments.getStore();
  const key = { guildId: guild.id, userId: targetId, productId: PROFILE_BG_PRODUCT_ID };

  if (sub === 'conceder') {
    const r = store.grantManual({ ...key, staffId: executorId });
    return { content: r.status === 'granted' ? `✅ Pase de Fondo concedido a <@${targetId}>.` : `ℹ️ <@${targetId}> ya tiene el pase.` };
  }
  if (sub === 'revocar') {
    const r = store.revokeManual(key);
    if (r.status !== 'revoked') return { content: `ℹ️ <@${targetId}> no tiene un pase activo.` };
    const enforced = await getProfileBackgroundService().enforceAccess(guild, targetId);
    return { content: `✅ Pase revocado a <@${targetId}>.${enforced.changed ? ' Su fondo personalizado fue retirado.' : ''}` };
  }
  if (sub === 'ordenes') {
    const orders = store.listOrdersForUser(guild.id, targetId);
    const lines = orders.length
      ? orders.map(o => `\`${o.id.slice(0, 8)}\` · ${o.status} · ${(o.amountCents / 100).toFixed(2)} ${o.currency.toUpperCase()} · <t:${Math.floor(o.createdAt / 1000)}:R>`).join('\n')
      : 'Sin órdenes.';
    return { embed: createEmbed(COLORS.info).setAuthor({ name: `🧾 Órdenes de ${targetId}` }).setDescription(lines) };
  }
  return { content: 'Uso: `conceder`, `revocar` u `ordenes` + usuario.' };
}

module.exports = {
  name: 'fondoadmin',
  description: 'Gestiona manualmente el Pase de Fondo (staff)',
  data: new SlashCommandBuilder()
    .setName('fondoadmin')
    .setDescription('Gestiona el Pase de Fondo (Exclusivo Dev)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('conceder').setDescription('Concede el pase a un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s => s.setName('revocar').setDescription('Revoca el pase de un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s => s.setName('ordenes').setDescription('Lista las órdenes de un usuario').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true))),

  async execute(interaction) {
    if (!isOwnerOrDev(interaction.user.id)) return interaction.reply({ embeds: [DENIED()], ephemeral: true });
    const result = await run(interaction.guild, interaction.user.id, interaction.options.getSubcommand(), interaction.options.getUser('usuario').id);
    return interaction.reply({ ...(result.embed ? { embeds: [result.embed] } : { content: result.content }), ephemeral: true });
  },

  async executePrefix(message, args) {
    if (!isOwnerOrDev(message.author.id)) return message.reply({ embeds: [DENIED()] });
    if (!message.guild) return message.reply('❌ Este comando solo puede usarse dentro de un servidor.');
    const sub = (args[0] || '').toLowerCase();
    const targetId = (message.mentions.users.first()?.id) || String(args[1] || '').replace(/[<@!>]/g, '');
    const result = await run(message.guild, message.author.id, sub, targetId);
    return message.reply(result.embed ? { embeds: [result.embed] } : result.content);
  }
};
