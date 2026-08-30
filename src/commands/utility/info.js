const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance, getInventory } = require('../../services/economy').economyService;
const { readLevels, getUserData, xpToNext, getUserRank } = require('../../services/level').levelService;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Muestra la información completa de un usuario.')
    .addUserOption(opt => opt.setName('usuario').setDescription('El usuario a consultar').setRequired(false)),

  async execute(interaction) {
    await this.handleInfo(interaction.guild, interaction.user, interaction.options.getUser('usuario'), interaction);
  },
  
  async executePrefix(message, args) {
    let targetUser = message.mentions.users.first();
    if (!targetUser && args[0]) {
      try {
        const fetched = await message.guild.members.fetch(args[0].replace(/[<@!>]/g, ''));
        targetUser = fetched.user;
      } catch {}
    }
    await this.handleInfo(message.guild, message.author, targetUser, message);
  },

  async handleInfo(guild, author, targetOpt, context) {
    if (!guild) return context.reply('❌ Este comando solo funciona en servidores.');
    
    let user = targetOpt || author;
    
    // Fetch full user to get banner if available
    user = await user.fetch(true).catch(() => user);
    const member = await guild.members.fetch(user.id).catch(() => null);

    let rolesDisplay = 'Sin roles';
    if (member) {
      const roleList = member.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);
      const roleMentions = roleList.map(r => `<@&${r.id}>`).slice(0, 15);
      const extra = Math.max(0, roleList.size - roleMentions.length);
      rolesDisplay = roleMentions.length ? roleMentions.join(', ') + (extra ? ` (+${extra} más)` : '') : 'Sin roles';
    }

    const createdAt = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
    const joinedAt = member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'N/A';

    let color = 0x5865F2;
    if (member?.displayHexColor && member.displayHexColor !== '#000000') {
      color = parseInt(member.displayHexColor.replace('#', ''), 16);
    } else if (user.hexAccentColor) {
      color = parseInt(user.hexAccentColor.replace('#', ''), 16);
    }

    // Economy
    const bal = getBalance(guild.id, user.id);
    const inv = getInventory(guild.id, user.id);
    const invCount = Object.values(inv).reduce((a, b) => a + b, 0);

    // Levels
    const levels = readLevels();
    const lvlData = getUserData(levels, guild.id, user.id);
    const rank = getUserRank(guild.id, user.id, levels) || '?';
    const nextXp = xpToNext(lvlData.level);

    const emb = new EmbedBuilder()
      .setAuthor({ name: `Perfil de ${user.tag}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setColor(color)
      .addFields(
        { name: '👤 Identidad', value: `**ID:** \`${user.id}\`\\n**Creación:** ${createdAt}\\n**Entrada:** ${joinedAt}`, inline: false },
        { name: '📊 Actividad', value: `**Nivel:** ${lvlData.level} (Rank #${rank})\\n**XP:** ${lvlData.xp} / ${nextXp}\\n**Mensajes:** ${lvlData.messages}`, inline: true },
        { name: '💰 Economía', value: `**Billetera:** ${bal.coins.toLocaleString()} 🪙\\n**Banco:** ${bal.bank.toLocaleString()} 🪙\\n**Mochila:** ${invCount} ítems`, inline: true },
        { name: `🏷️ Roles (${member ? Math.max(0, member.roles.cache.size - 1) : 0})`, value: rolesDisplay, inline: false }
      )
      .setFooter({ text: `Solicitado por ${author.tag}` })
      .setTimestamp();
      
    if (user.banner) {
      emb.setImage(user.bannerURL({ dynamic: true, size: 1024 }));
    }

    await context.reply({ embeds: [emb], allowedMentions: { parse: [] } });
  }
};
