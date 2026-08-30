const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const dataDir = path.join(__dirname, '..', 'data');
const boostsPath = path.join(dataDir, 'boosts.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
function readBoosts() { try { return JSON.parse(fs.readFileSync(boostsPath, 'utf8')); } catch { return {}; } }

module.exports = {
  name: 'boosters',
  description: 'Muestra boosters y sus boosts (Admin only)',
  async execute(message, args, client) {
    if (!message.guild) return message.channel.send('Este comando solo funciona en servidores.');
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.channel.send('🚫 Necesitas permisos de Administrador o Administrar servidor.');
    }

    let members;
    try { members = await message.guild.members.fetch(); } catch { members = message.guild.members.cache; }

    const boosters = members.filter(m => m.premiumSince != null);
    const totalBoosts = typeof message.guild.premiumSubscriptionCount === 'number'
      ? message.guild.premiumSubscriptionCount
      : (message.guild.premiumSubscriptionCount || 0);

    const allCounts = readBoosts()[message.guild.id] || {};

    if (boosters.size === 0) {
      const e = new EmbedBuilder()
        .setTitle('🔰 Boosters del servidor')
        .setDescription(`Boosts totales: **${totalBoosts}**\n\nNadie está boosteando ahora.`)
        .setColor(0xFFD166)
        .setTimestamp();
      return message.channel.send({ embeds: [e] });
    }

    const list = boosters.first(25);
    const usersCol = list.map(m => `<@${m.id}>`).join('\n') || '—';
    const sinceCol = list.map(m => (m.premiumSince ? new Date(m.premiumSince).toLocaleString() : '—')).join('\n') || '—';
    const countCol = list.map(m => String(Number(allCounts[m.id] || 0))).join('\n') || '—';

    const embed = new EmbedBuilder()
      .setTitle('🔰 Boosters del servidor')
      .setColor(0xFFD166)
      .setTimestamp()
      .setDescription(`Boosts totales: **${totalBoosts}**`)
      .addFields(
        { name: 'Usuario', value: usersCol, inline: true },
        { name: 'Desde', value: sinceCol, inline: true },
        { name: 'Boosts', value: countCol, inline: true }
      );

    if (boosters.size > 25) {
      embed.setFooter({ text: `Mostrando 25 de ${boosters.size} boosters` });
    }

    return message.channel.send({ embeds: [embed] });
  }
};
