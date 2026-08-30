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
    if (!interaction.guild) return interaction.reply({ content: 'Este comando solo funciona en servidores.', flags: 64 });

    let members;
    try { members = await interaction.guild.members.fetch(); } catch { members = interaction.guild.members.cache; }

    const boosters = members.filter(m => m.premiumSince != null);
    const totalBoosts = typeof interaction.guild.premiumSubscriptionCount === 'number'
      ? interaction.guild.premiumSubscriptionCount
      : (interaction.guild.premiumSubscriptionCount || 0);

    const guildCounts = readBoosts()[interaction.guild.id] || {};

    if (boosters.size === 0) {
      const e = new EmbedBuilder()
        .setTitle('🔰 Boosters del servidor')
        .setDescription(`Boosts totales: **${totalBoosts}**\n\nNadie está boosteando ahora.`)
        .setColor(0xFFD166)
        .setTimestamp();
      return interaction.reply({ embeds: [e], flags: 64 });
    }

    // Crear opciones para el menú select
    const options = boosters.map(m => ({
      label: m.user.username,
      value: m.id,
      description: `Desde: ${m.premiumSince ? new Date(m.premiumSince).toLocaleDateString() : '—'}`,
      emoji: '🚀'
    })).slice(0, 25); // Discord limita a 25 opciones

    // Mostrar lista de boosters y cantidad de boosts activos
    const boostersList = boosters.map(m => {
      const entry = guildCounts[m.id];
      let userTotal = 1;
      if (entry && typeof entry === 'object' && entry.count) userTotal = entry.count;
      else if (typeof entry === 'number') userTotal = entry;
      return `• <@${m.id}> — Boosts activos: **${userTotal}**`;
    }).join('\n');

    const selectMenu = {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: 'booster_select',
          options
        }
      ]
    };

    const embed = new EmbedBuilder()
      .setTitle('🔰 Lista de Boosters')
      .setColor(0xFFD166)
      .setDescription(`Boosts totales: **${totalBoosts}**\n\n${boostersList}\n\nSelecciona un usuario para ver su información detallada.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], components: [selectMenu], flags: 64 });
  },

  // Handler para el menú select
  async handleSelect(interaction) {
    const guildCounts = readBoosts()[interaction.guild.id] || {};
    const userId = interaction.values[0];
    const member = await interaction.guild.members.fetch(userId);
    const entry = guildCounts[userId];
    const joinDate = member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : '—';
    const boostSince = member.premiumSince ? new Date(member.premiumSince).toLocaleString() : '—';
    let userTotal = 1;
    if (entry && typeof entry === 'object' && entry.count) userTotal = entry.count;
    else if (typeof entry === 'number') userTotal = entry;

    const embed = new EmbedBuilder()
      .setTitle(`🚀 Booster: ${member.user.username}`)
      .setColor(0xFFD166)
      .setDescription(`**Usuario:** <@${member.id}>\n**Join Date:** ${joinDate}\n**Boost Desde:** ${boostSince}\n**User Total:** ${userTotal}`)
      .setTimestamp();

    // Botón de retroceder
    const backButton = {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: '⬅️ Volver',
          custom_id: 'booster_back'
        }
      ]
    };

    await interaction.update({ embeds: [embed], components: [backButton], flags: 64 });
  },

  // Handler para el botón de retroceder
  async handleBack(interaction) {
    // Re-ejecutar la vista inicial
    await module.exports.execute(interaction);
  }
  }
;