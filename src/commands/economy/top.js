const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../../services/economy/index').economyService;
const { readProfiles } = require('../../utils/profileStore');

async function handleTop(guildId, guildName) {
  const profiles = readProfiles();
  const usersData = [];
  
  for (const [uid, userProfile] of Object.entries(profiles)) {
    const bal = getBalance(guildId, uid);
    if (bal && bal.coins > 0) {
      usersData.push({ id: uid, coins: bal.coins });
    }
  }
  
  usersData.sort((a, b) => b.coins - a.coins);
  const top = usersData.slice(0, 10);
  
  if (top.length === 0) {
    return { error: 'No hay datos de economía todavía.' };
  }
  
  const medals = ['🥇', '🥈', '🥉'];
  
  const descriptionStr = top.map((u, i) => {
    const rank = i < 3 ? medals[i] : `**${i + 1}.**`;
    return `${rank} <@${u.id}> - ${u.coins.toLocaleString()} 🪙`;
  }).join('\n');
  
  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setAuthor({ name: '🏆 Top 10 Economía' })
    .addFields({ name: 'Millonarios del Servidor', value: `> \n${descriptionStr.split('\n').map(line => '> ' + line).join('\n')}`, inline: false })
    .setFooter({ text: `Servidor: ${guildName}` })
    .setTimestamp();
    
  return { embed };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ecotop')
    .setDescription('Muestra el Top 10 de usuarios con más monedas en el servidor.'),
  async execute(interaction) {
    const result = await handleTop(interaction.guildId, interaction.guild.name);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const result = await handleTop(message.guild.id, message.guild.name);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
