module.exports = {
    name: 'kick',
    description: 'kick via prefix: ban <mención|id|nombre> [razón] [days]',
    async execute(message, args) {
    try {
      if (!message.member.permissions.has('KickMembers')) return message.reply('❌ No tienes permiso para expulsar.');
      const targetArg = args[0];
      if (!targetArg) return message.reply('Uso: kick <mención|id|nombre> [razón]');

      const reason = args.slice(1).join(' ') || 'No especificada';
      const guild = message.guild;

      async function resolveMember(input) {
        input = input.trim();
        const mention = input.match(/^<@!?(\d+)>$/);
        if (mention) {
          try { return await guild.members.fetch(mention[1]); } catch { return null; }
        }
        if (/^\d{17,19}$/.test(input)) {
          try { return await guild.members.fetch(input); } catch {}
        }
        const byTag = guild.members.cache.find(m => m.user.tag.toLowerCase() === input.toLowerCase());
        if (byTag) return byTag;
        const byName = guild.members.cache.find(m => m.user.username.toLowerCase() === input.toLowerCase() || m.displayName.toLowerCase() === input.toLowerCase());
        if (byName) return byName;
        try {
          const fetched = await guild.members.fetch({ query: input, limit: 5 });
          if (fetched && fetched.size) return fetched.first();
        } catch {}
        return null;
      }

      const member = await resolveMember(targetArg);
      if (!member) return message.reply('❌ No se encontró el miembro.');

      if (member.id === message.author.id) return message.reply('❌ No puedes expulsarte a ti mismo.');
      const me = await guild.members.fetchMe();
      if (!me.permissions.has('KickMembers')) return message.reply('❌ No tengo permiso para expulsar.');
      if (member.roles.highest.position >= me.roles.highest.position) return message.reply('❌ No puedo expulsar a ese miembro por jerarquía.');

      await member.kick(`${reason} — por ${message.author.tag}`);
      return message.reply(`✅ Expulsado: ${member.user.tag} (${member.id})\nRazón: ${reason}`);
    } catch (err) {
      console.error('prefix kick error:', err);
      return message.reply('❌ Error al expulsar al miembro.');
    }
  }
};