const logger = require('../utils/logger');
const { createSuccessEmbed, createErrorEmbed } = require('../utils/embedFactory');

module.exports = {
    name: 'ban',
    description: 'Banea a un usuario. Uso: ban <mención|id> [razón] [días]',
    async execute(message, args) {
        try {
            if (!message.member.permissions.has('BanMembers')) 
                return message.reply('❌ No tienes permiso para banear.');

            const targetArg = args[0];
            if (!targetArg) 
                return message.reply('Uso: ban <mención|id> [razón] [días]');

            let days = 0;
            const possibleDays = parseInt(args[args.length - 1], 10);
            if (!isNaN(possibleDays) && possibleDays >= 0 && possibleDays <= 7) {
                days = possibleDays;
                args.pop();
            }
            
            const reason = args.slice(1).join(' ') || 'No especificada';
            const guild = message.guild;

            const userId = targetArg.replace(/[<@!>]/g, '');
            let userToBan;
            
            try {
                userToBan = await message.client.users.fetch(userId);
            } catch {
                return message.reply('❌ No se encontró el usuario. Usa una mención o ID válida.');
            }

            if (userToBan.id === message.author.id)
                return message.reply('❌ No puedes banearte a ti mismo.');

            const me = await guild.members.fetchMe();
            if (!me.permissions.has('BanMembers'))
                return message.reply('❌ No tengo permiso para banear.');

            const memberToBan = await guild.members.fetch(userId).catch(() => null);
            if (memberToBan) {
                if (memberToBan.roles.highest.position >= me.roles.highest.position) {
                    return message.reply('❌ No puedo banear a ese miembro por jerarquía.');
                }
                if (message.author.id !== guild.ownerId && memberToBan.roles.highest.position >= message.member.roles.highest.position) {
                    return message.reply('❌ No puedes banear a alguien con un rol igual o superior al tuyo.');
                }
            }

            await guild.bans.create(userToBan.id, {
                deleteMessageDays: days,
                reason: `${reason} — por ${message.author.tag}`
            });

            const embed = createSuccessEmbed(
                '✅ Miembro Baneado',
                `**Usuario:** ${userToBan.tag} (${userToBan.id})\n**Razón:** ${reason}\n**Mensajes borrados:** ${days} días`
            );
            return message.reply({ embeds: [embed] });
        } catch (err) {
            logger.error('[prefix/ban] Error ejecutando ban:', { error: err.message, stack: err.stack });
            return message.reply('❌ Error al banear al usuario.');
        }
    }
};
