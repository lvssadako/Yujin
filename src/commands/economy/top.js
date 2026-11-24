const { createEmbed } = require('../../utils/ui');
const { SlashCommandBuilder, } = require('discord.js');
const { getBalance } = require('../../services/economy/index').economyService;
const { readProfiles } = require('../../utils/profileStore');
const { money } = require('../../utils/economyView');
const { progressBar } = require('../../utils/ui');

async function handleTop(guildId, guildName, guild = null, requesterId = null) {
  const profiles = readProfiles();
  const usersData = [];
  const guildUsers = (profiles.users && profiles.users[guildId]) ? profiles.users[guildId] : {};
  
  for (const uid of Object.keys(guildUsers)) {
    if (guild) {
      const member = guild.members?.cache?.get(uid);
      const user = guild.client?.users?.cache?.get(uid) || member?.user;
      if (user?.bot) continue;
    }
    const bal = getBalance(guildId, uid);
    const total = (bal.coins || 0) + (bal.bank || 0);
    if (total > 0) {
      usersData.push({ id: uid, coins: bal.coins || 0, bank: bal.bank || 0, total });
    }
  }
  
  usersData.sort((a, b) => b.total - a.total);
  const top = usersData.slice(0, 10);
  
  if (top.length === 0) {
    return { error: 'No hay datos de economía todavía.' };
  }
  
  const medals = ['🥇', '🥈', '🥉'];
  
  const leader = top[0].total;
  const descriptionStr = top.map((u, i) => {
    const rank = i < 3 ? medals[i] : `**${i + 1}.**`;
    return `${rank} <@${u.id}> — ${money(u.total)}\n${progressBar(u.total, leader, 8)} · 👛 ${u.coins.toLocaleString('es-MX')} · 🏦 ${u.bank.toLocaleString('es-MX')}`;
  }).join('\n\n');

  const position = requesterId ? usersData.findIndex(u => u.id === requesterId) + 1 : 0;
  const mine = position > 0 ? `Tu posición: **#${position}** de ${usersData.length}` : 'Aún no apareces en el ranking: ¡empieza con /daily!';

  const embed = createEmbed(0xFFD700)
    .setAuthor({ name: '🏆 Los más ricos del servidor', iconURL: guild?.iconURL?.() || undefined })
    .setDescription(descriptionStr)
    .addFields({ name: '📍 Tú', value: mine, inline: false })
    .setFooter({ text: `${guildName} · El total suma billetera y banco` })
    .setTimestamp();
  if (guild?.iconURL?.()) embed.setThumbnail(guild.iconURL());
    
  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ecotop')
    .setDescription('Muestra el Top 10 de usuarios con más monedas en el servidor.'),
  async execute(interaction) {
    const result = await handleTop(interaction.guildId, interaction.guild.name, interaction.guild, interaction.user.id);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const result = await handleTop(message.guild.id, message.guild.name, message.guild, message.author.id);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
