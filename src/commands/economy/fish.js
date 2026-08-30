const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInventory, addCoins } = require('../../services/economy').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fish')
    .setDescription('Ve a pescar y gana monedas (Requiere Caña de Pescar) (Cooldown: 1h).'),
  async execute(interaction) {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    
    const inv = getInventory(guildId, userId);
    if (!inv['cana'] || inv['cana'] < 1) {
      return interaction.reply({ content: '❌ ¡No tienes una **🎣 Caña de Pescar**! Cómprala en la tienda con `/buy`.', ephemeral: true });
    }
    
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    
    const now = Date.now();
    const cooldown = 60 * 60 * 1000; // 1 hour
    const lastFish = user.lastFish || 0;
    
    if (now - lastFish < cooldown) {
      const left = Math.ceil((cooldown - (now - lastFish)) / 60000);
      return interaction.reply({ content: `⏳ Los peces están asustados. Vuelve en **${left} minutos**.`, ephemeral: true });
    }
    
    user.lastFish = now;
    writeProfiles(profiles);
    
    const rand = Math.random();
    let reward = 0;
    let msg = '';
    
    if (rand < 0.2) {
      msg = 'Solo pescaste una bota vieja... No ganas nada. 🥾';
    } else if (rand < 0.6) {
      reward = Math.floor(Math.random() * 100) + 50;
      msg = `¡Pescaste un pez común! Lo vendiste por **${reward} 🪙**. 🐟`;
    } else if (rand < 0.9) {
      reward = Math.floor(Math.random() * 200) + 150;
      msg = `¡Atrapaste un pez raro! Lo vendiste por **${reward} 🪙**. 🐠`;
    } else {
      reward = Math.floor(Math.random() * 500) + 500;
      msg = `¡INCREÍBLE! Pescaste un **Tiburón Dorado**. Lo vendiste por **${reward} 🪙**. 🦈✨`;
    }
    
    if (reward > 0) addCoins(guildId, userId, reward);
    
    const emb = new EmbedBuilder().setColor(0x3498DB).setTitle('🎣 Día de Pesca').setDescription(msg);
    await interaction.reply({ embeds: [emb] });
  },
  async executePrefix(message) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    
    const inv = getInventory(guildId, userId);
    if (!inv['cana'] || inv['cana'] < 1) {
      return message.reply('❌ ¡No tienes una **🎣 Caña de Pescar**! Cómprala en la tienda con `&buy`.');
    }
    
    const profiles = readProfiles();
    const user = ensureUser(profiles, guildId, userId);
    
    const now = Date.now();
    const cooldown = 60 * 60 * 1000;
    const lastFish = user.lastFish || 0;
    
    if (now - lastFish < cooldown) {
      const left = Math.ceil((cooldown - (now - lastFish)) / 60000);
      return message.reply(`⏳ Los peces están asustados. Vuelve en **${left} minutos**.`);
    }
    
    user.lastFish = now;
    writeProfiles(profiles);
    
    const rand = Math.random();
    let reward = 0;
    let msgText = '';
    
    if (rand < 0.2) {
      msgText = 'Solo pescaste una bota vieja... No ganas nada. 🥾';
    } else if (rand < 0.6) {
      reward = Math.floor(Math.random() * 100) + 50;
      msgText = `¡Pescaste un pez común! Lo vendiste por **${reward} 🪙**. 🐟`;
    } else if (rand < 0.9) {
      reward = Math.floor(Math.random() * 200) + 150;
      msgText = `¡Atrapaste un pez raro! Lo vendiste por **${reward} 🪙**. 🐠`;
    } else {
      reward = Math.floor(Math.random() * 500) + 500;
      msgText = `¡INCREÍBLE! Pescaste un **Tiburón Dorado**. Lo vendiste por **${reward} 🪙**. 🦈✨`;
    }
    
    if (reward > 0) addCoins(guildId, userId, reward);
    
    const emb = new EmbedBuilder().setColor(0x3498DB).setTitle('🎣 Día de Pesca').setDescription(msgText);
    await message.reply({ embeds: [emb] });
  }
};
