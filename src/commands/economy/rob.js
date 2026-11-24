const { createEmbed, COLORS } = require('../../utils/ui');
const { SlashCommandBuilder, } = require('discord.js');
const { getBalance, addCoins, removeCoins, getInventory, removeItem } = require('../../services/economy/index').economyService;
const { readProfiles, writeProfiles, ensureUser } = require('../../utils/profileStore');
const { money, withActor, cooldownField } = require('../../utils/economyView');

async function handleRob(guildId, userId, targetUser, discordUser = null) {
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
    
    const embed = withActor(createEmbed(COLORS.error), discordUser, '🛡️ Robo bloqueado')
      .setDescription(`Intentaste robar a **${targetUser.tag || targetUser.username}**, pero tenía un **Escudo Anti-Robo**. Tu ataque falló y su escudo se rompió.`)
      .addFields(
        { name: '⚖️ Multa', value: `-${money(fine)}`, inline: true },
        cooldownField('Próximo intento', now + cooldown)
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
    
    const embed = withActor(createEmbed(COLORS.success), discordUser, '🥷 Robo exitoso')
      .setDescription(`Le quitaste ${money(stolen)} a **${targetUser.tag || targetUser.username}** sin que te detectaran.`)
      .addFields(
        { name: '💰 Botín', value: `+${money(stolen)}`, inline: true },
        { name: '👛 Tu billetera', value: money(getBalance(guildId, userId).coins), inline: true },
        cooldownField('Próximo golpe', now + cooldown)
      )
      .setFooter({ text: 'Guarda tu dinero en el banco: /bank deposit' })
      .setTimestamp();
      
    return { embed };
  } else {
    const fine = 250;
    removeCoins(guildId, userId, fine);
    
    const embed = withActor(createEmbed(COLORS.error), discordUser, '🚨 Robo fallido')
      .setDescription(`¡La policía te atrapó intentando robar a **${targetUser.tag || targetUser.username}**!`)
      .addFields(
        { name: '💸 Multa', value: `-${money(fine)}`, inline: true },
        cooldownField('Próximo intento', now + cooldown)
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
    const result = await handleRob(interaction.guildId, interaction.user.id, target, interaction.user);
    if (result.error) return interaction.reply({ content: result.error, ephemeral: true });
    await interaction.reply({ embeds: [result.embed] });
  },
  async executePrefix(message) {
    const target = message.mentions.users.first();
    if (!target) return message.reply('❌ Debes mencionar a un usuario para robar (ej: `&rob @usuario`).');
    const result = await handleRob(message.guild.id, message.author.id, target, message.author);
    if (result.error) return message.reply(result.error);
    await message.reply({ embeds: [result.embed] });
  }
};
