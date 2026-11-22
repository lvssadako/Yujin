const { SlashCommandBuilder } = require('discord.js');
const { resolvePurchase, resolveStatus } = require('../../services/payments/purchaseFlow');

function replyPayload(result) {
  return result.embed ? { embeds: [result.embed], ephemeral: true } : { content: result.content, ephemeral: true };
}

module.exports = {
  name: 'fondo',
  description: 'Compra o consulta el acceso a fondos de perfil con tu propia imagen',
  aliases: ['background'],
  data: new SlashCommandBuilder()
    .setName('fondo')
    .setDescription('Fondos de perfil con tu propia imagen')
    .setDMPermission(false)
    .addSubcommand(s => s.setName('comprar').setDescription('Compra el Pase de Fondo (pago único)'))
    .addSubcommand(s => s.setName('estado').setDescription('Consulta si ya puedes usar tu propia imagen de fondo')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Este comando solo funciona dentro de un servidor.', ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const result = sub === 'comprar' ? resolvePurchase(interaction.member) : resolveStatus(interaction.member);
    return interaction.reply(replyPayload(result));
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('❌ Este comando solo funciona dentro de un servidor.');
    const sub = (args[0] || 'estado').toLowerCase();
    if (!['comprar', 'buy', 'estado', 'status'].includes(sub)) {
      return message.reply('Uso: `&fondo comprar` o `&fondo estado`.');
    }
    if (sub === 'estado' || sub === 'status') {
      return message.reply({ embeds: [resolveStatus(message.member).embed] });
    }
    const result = resolvePurchase(message.member);
    if (result.kind !== 'offer') return message.reply(result.content);
    // El enlace de pago es personal: se entrega por DM, nunca en el canal.
    try {
      await message.author.send({ embeds: [result.embed] });
      return message.reply('📩 Te envié el enlace de pago por mensaje privado.');
    } catch {
      return message.reply('❌ No pude escribirte por DM. Activa tus mensajes privados o usa `/fondo comprar`, que responde solo para ti.');
    }
  }
};
