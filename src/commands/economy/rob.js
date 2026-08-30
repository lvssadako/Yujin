const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, addCoins, removeCoins, getInventory, removeItem } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');

async function handleRob(guildId, userId, targetUser) {
  if (targetUser.bot || targetUser.id === userId) {
    return { error: '❌ No puedes robarte a ti mismo ni a un bot.' };
  }
  
  const profiles = readProfiles();
  const user = ensureUser(profiles, guildId, userId);
  
  const now = Date.now();
  const cooldown = 12 * 60 * 60 * 1000;
  const lastRob = user.lastRob || 0;
  
  if (now - lastRob < cooldown) {
    const left = Math.ceil((cooldown - (now - lastRob)) / 3600000);
    return { error: `🚓 Estás siendo buscado. Escóndete por **${left} horas** antes de volver a robar.` };
  }
  
  const targetBal = getBalance(guildId, targetUser.id).coins;
  if (targetBal < 500) {
    return { error: `❌ **${targetUser.tag || targetUser.username}** es demasiado pobre en su billetera (menos de 500 🪙). ¡Busca a alguien más rico!` };
  }
  
  user.lastRob = now;
  writeProfiles(profiles);
  
  const targetInv = getInventory(guildId, targetUser.id);
  if (targetInv['escudo'] && targetInv['escudo'] > 0) {
    removeItem(guildId, targetUser.id, 'escudo', 1);
    const fine = 500;
    removeCoins(guildId, userId, fine);
    
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: '🛡️ Robo Bloqueado' })
      .addFields(
        { name: '📝 Resumen', value: `> ¡Intentaste robar a **${targetUser.tag || targetUser.username}** pero tenía un **Escudo Anti-Robo**!\n> Tu ataque fue bloqueado y su escudo se rompió.`, inline: false },
        { name: '⚖️ Multa Pagada', value: `> **${fine} 🪙**`, inline: false }
      )
      .setFooter({ text: 'Ten cuidado con las defensas ajenas' })
      .setTimestamp();
      
    return { embed };
  }
  
const { secureRandom } = require('../../utils/cryptoRandom');

  const success = secureRandom() > 0.55;
  if (success) {
    const stolen = Math.max(1, Math.floor(targetBal * (secureRandom() * 0.15 + 0.05)));
    removeCoins(guildId, targetUser.id, stolen);
    addCoins(guildId, userId, stolen);
    
    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setAuthor({ name: '🥷 Robo Exitoso' })
      .addFields(
        { name: '💰 Botín Obtenido', value: `> Lograste robarle **${stolen} 🪙** a **${targetUser.tag || targetUser.username}** sin ser detectado.`, inline: false },
        { name: '👛 Tu Nuevo Balance', value: `> **${getBalance(guildId, userId).coins} 🪙**`, inline: false }
      )
      .setFooter({ text: 'No dejes que te atrapen' })
      .setTimestamp();
      
    return { embed };
  } else {
    const fine = 250;
    removeCoins(guildId, userId, fine);
    
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setAuthor({ name: '🚨 Robo Fallido' })
      .addFields(
        { name: '⚖️ Consecuencias', value: `> ¡Te atrapó la policía intentando robar a **${targetUser.tag || targetUser.username}**!`, inline: false },
        { name: '💸 Multa Pagada', value: `> **${fine} 🪙**`, inline: false }
      )
      .setFooter({ text: 'El crimen no siempre paga' })
      .setTimestamp();
      
    return { embed };
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Intenta robar monedas a otro usuario (Cooldown: 12h).')
    .addUserOption(opt => opt.setName('victima').setDescription('Usuario a robar').setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getUser('victima');
    const result = await handleRob(interaction.guildId, interaction.user.id, target);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Debes mencionar a un usuario para robar (ej: `&rob @usuario`).');
    const result = await handleRob(message.guild.id, message.author.id, target);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
