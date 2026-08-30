
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Intenta robar monedas a otro usuario (Cooldown: 12h).')
    .addUserOption(opt => opt.setName('victima').setDescription('Usuario a robar').setRequired(true)),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const target = interaction.options.getUser('victima');
    
    if (target.bot || target.id === userId) return interaction.reply({ content: '❌ No puedes robarte a ti mismo ni a un bot.', ephemeral: true });
    
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    
    const now = Date.now();
    const cooldown = 12 * 60 * 60 * 1000;
    const lastRob = user.lastRob || 0;
    
    if (now - lastRob < cooldown) {
      const left = Math.ceil((cooldown - (now - lastRob)) / 3600000);
      return interaction.reply({ content: `🚓 Estás siendo buscado. Escóndete por **${left} horas** antes de volver a robar.`, ephemeral: true });
    }
    
    const targetBal = getBalance(guildId, target.id).coins;
    if (targetBal < 500) {
      return interaction.reply({ content: `❌ **${target.tag}** es demasiado pobre (menos de 500 🪙). ¡Busca a alguien más rico!`, ephemeral: true });
    }
    
    user.lastRob = now;
    writeProfiles(profiles);
    
    const success = Math.random() > 0.55; // 45% chance to win
    if (success) {
      const stolen = Math.floor(targetBal * (Math.random() * 0.15 + 0.05)); // rob 5-20%
      removeCoins(guildId, target.id, stolen);
      addCoins(guildId, userId, stolen);
      const emb = new EmbedBuilder().setColor(0x57F287).setDescription(`🥷 ¡Lograste robarle **${stolen} 🪙** a **${target.tag}** sin ser detectado!`);
      await interaction.reply({ embeds: [emb] });
    } else {
      const fine = 250;
      removeCoins(guildId, userId, fine);
      const emb = new EmbedBuilder().setColor(0xED4245).setDescription(`🚨 ¡Te atrapó la policía intentando robar a **${target.tag}**! Pagas una multa de **${fine} 🪙**.`);
      await interaction.reply({ embeds: [emb] });
    }
  }
};
