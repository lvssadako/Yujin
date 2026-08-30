const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'info',
  description: 'Muestra info de usuario',
  async execute(message, args, client) {
    if (!message.guild) return message.channel.send('❌ Este comando solo funciona en servidores.');

    // Resolver usuario (mención, ID o autor)
    let user = message.mentions.users.first();
    if (!user && args[0]) {
      try {
        const fetched = await message.guild.members.fetch(args[0]);
        user = fetched.user;
      } catch {}
    }
    if (!user) user = message.author;

    const member = await message.guild.members.fetch(user.id).catch(() => null);

    // Roles (excluir @everyone), mostrar como menciones de rol pero sin "ping" a usuarios
    let rolesDisplay = 'Sin roles';
    if (member) {
      const roleList = member.roles.cache
        .filter(r => r.id !== message.guild.id) // excluir @everyone
        .sort((a, b) => b.position - a.position);

      const roleMentions = roleList.map(r => `<@&${r.id}>`).slice(0, 20);
      const extra = Math.max(0, roleList.size - roleMentions.length);
      rolesDisplay = roleMentions.length ? roleMentions.join(', ') + (extra ? ` (+${extra} más)` : '') : 'Sin roles';
    }

    // Fechas formateadas
    const createdAt = user.createdAt ? user.createdAt.toLocaleString() : 'N/A';
    const joinedAt = member && member.joinedAt ? member.joinedAt.toLocaleString() : 'N/A';

    // Color del embed: usa color del miembro si existe, si no fallback a discord blurple
    let color = 0x5865F2;
    if (member && member.displayHexColor && member.displayHexColor !== '#000000') {
      color = parseInt(member.displayHexColor.replace('#', ''), 16);
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setColor(color)
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Creado', value: createdAt, inline: true },
        { name: 'Unido al servidor', value: joinedAt, inline: true },
        { name: `Roles (${member ? Math.max(0, member.roles.cache.size - 1) : 0})`, value: rolesDisplay, inline: false }
      )
      .setFooter({ text: `Solicitado por ${message.author.tag}` })
      .setTimestamp();

    // Enviar embed sin permitir pings a roles/usuarios (seguro)
    return await message.channel.send({
      embeds: [embed],
      allowedMentions: { parse: [], roles: [], users: [] }
    });
  }
};
