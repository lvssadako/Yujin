
const { readSettings } = require('../../utils/guildSettings');
const { logAutomod } = require('../audit/auditLogger');
const { PermissionFlagsBits } = require('discord.js');

const spamCache = new Map();

module.exports = {
  checkMessage: async (message) => {
    if (message.author.bot || !message.guild) return false;
    
    // Ignorar Admins/Mods
    if (message.member && (message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator))) {
      return false;
    }

    const settings = readSettings();
    const guildConf = settings[message.guild.id] || {};
    if (!guildConf.automodEnabled) return false;

    // Anti-Link (Invitaciones de Discord)
    const inviteRegex = /(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
    if (inviteRegex.test(message.content)) {
      await message.delete().catch(() => {});
      try { await message.member.timeout(5 * 60 * 1000, 'Automod: Enviar invitaciones de Discord no permitidas.'); } catch (e) {}
      await logAutomod(message.guild, message.author, 'Envió una invitación de Discord externa.', 'Mensaje eliminado y Timeout de 5m.');
      return true;
    }

    // Anti-Spam
    const userId = message.author.id;
    const now = Date.now();
    const userSpam = spamCache.get(userId) || [];
    userSpam.push(now);
    
    // Filtrar mensajes más antiguos a 5 segundos
    const recent = userSpam.filter(t => now - t < 5000);
    spamCache.set(userId, recent);

    if (recent.length > 5) {
      // Spam detectado (>5 mensajes en 5 segundos)
      await message.delete().catch(() => {});
      try { await message.member.timeout(10 * 60 * 1000, 'Automod: Spam excesivo detectado.'); } catch (e) {}
      await logAutomod(message.guild, message.author, 'Spam masivo (más de 5 mensajes en 5s).', 'Mensaje eliminado y Timeout de 10m.');
      spamCache.delete(userId);
      return true;
    }

    return false;
  }
};
