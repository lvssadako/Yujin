const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const dataDir = path.join(__dirname, '..', 'data');
const boostsPath = path.join(dataDir, 'boosts.json');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
function readBoosts() { try { return JSON.parse(fs.readFileSync(boostsPath, 'utf8')); } catch { return {}; } }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('boosters')
    .setDescription('Muestra boosters y sus boosts (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ content: 'Este comando solo funciona en servidores.', ephemeral: true });

    let members;
    try { members = await interaction.guild.members.fetch(); } catch { members = interaction.guild.members.cache; }

    const boosters = members.filter(m => m.premiumSince != null);
    const totalBoosts = typeof interaction.guild.premiumSubscriptionCount === 'number'
      ? interaction.guild.premiumSubscriptionCount
      : (interaction.guild.premiumSubscriptionCount || 0);

    const allCounts = readBoosts()[interaction.guild.id] || {};

    if (boosters.size === 0) {
      const e = new EmbedBuilder()
        .setTitle('🔰 Boosters del servidor')
        .setDescription(`Boosts totales: **${totalBoosts}**\n\nNadie está boosteando ahora.`)
        .setColor(0xFFD166)
        .setTimestamp();
      return interaction.reply({ embeds: [e], ephemeral: true });
    }

    // limitar a 25 para evitar overflow en embed fields
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

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};