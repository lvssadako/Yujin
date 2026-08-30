async function requestMFA(bot, user, action, score, channelId) {
  const channel = await bot.channels.fetch(channelId);
  const msg = await channel.send({
    embeds: [{
      title: '🔒 Solicitud de MFA',
      description: `Usuario: ${user.tag}\nAcción: ${action}\nScore: ${score}\n¿Aprobar?`,
      color: 0xffc107
    }],
    components: [{
      type: 1,
      components: [
        { type: 2, style: 3, label: 'Aprobar', custom_id: 'mfa_aprobar' },
        { type: 2, style: 4, label: 'Denegar', custom_id: 'mfa_denegar' }
      ]
    }]
  });
  // Espera respuesta de admin (simplificado)
  const filter = i => ['mfa_aprobar', 'mfa_denegar'].includes(i.customId);
  const collected = await msg.awaitMessageComponent({ filter, time: 60000 }).catch(() => null);
  return collected?.customId === 'mfa_aprobar';
}
module.exports = { requestMFA };