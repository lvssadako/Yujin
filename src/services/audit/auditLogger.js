
const { EmbedBuilder } = require('discord.js');
const { readSettings } = require('../../utils/guildSettings');
const logger = require('../../utils/logger');

async function getAuditChannel(guild) {
  const settings = readSettings();
  const guildConf = settings[guild.id] || {};
  if (!guildConf.auditChannel) return null;
  try {
    return await guild.channels.fetch(guildConf.auditChannel);
  } catch (err) {
    return null;
  }
}

async function sendAudit(guild, embed) {
  const channel = await getAuditChannel(guild);
  if (channel) {
    try { await channel.send({ embeds: [embed] }); } catch (err) { logger.warn('Failed to send audit log', { err: err.message }); }
  }
}

module.exports = {
  logMessageDelete: async (message) => {
    if (message.author?.bot || !message.guild) return;
    const emb = new EmbedBuilder().setColor(0xED4245).setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setTitle('🗑️ Mensaje Eliminado')
      .setDescription(`Un mensaje de **${message.author.tag}** fue eliminado en <#${message.channel.id}>.\n\n**Contenido:**\n${message.content || '*Sin texto (solo imágenes/embeds)*'}`)
      .setFooter({ text: `ID Usuario: ${message.author.id}` }).setTimestamp();
    await sendAudit(message.guild, emb);
  },
  logMessageUpdate: async (oldMsg, newMsg) => {
    if (oldMsg.author?.bot || !oldMsg.guild || oldMsg.content === newMsg.content) return;
    const emb = new EmbedBuilder().setColor(0xF1C40F).setAuthor({ name: oldMsg.author.tag, iconURL: oldMsg.author.displayAvatarURL() })
      .setTitle('✏️ Mensaje Editado')
      .setDescription(`Un mensaje de **${oldMsg.author.tag}** fue editado en <#${oldMsg.channel.id}>.\n\n**Antes:**\n${oldMsg.content || '*Vacío*'}\n\n**Después:**\n${newMsg.content || '*Vacío*'}`)
      .addFields({ name: 'Enlace', value: `[Ir al mensaje](${newMsg.url})` })
      .setFooter({ text: `ID Usuario: ${oldMsg.author.id}` }).setTimestamp();
    await sendAudit(oldMsg.guild, emb);
  },
  logAutomod: async (guild, user, reason, action) => {
    const emb = new EmbedBuilder().setColor(0x9B59B6).setTitle('🛡️ Automod Trigger')
      .setDescription(`El sistema Automod ha detectado una infracción.\n\n**Usuario:** <@${user.id}> (${user.tag})\n**Razón:** ${reason}\n**Acción Tomada:** ${action}`)
      .setTimestamp();
    await sendAudit(guild, emb);
  }
};
