const logger = require('../src/utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

async function resolveUser(client, input) {
    if (!input) return null;
    input = input.trim();
    const cleanId = input.replace(/[<@!>]/g, '');
    if (/^\d{17,19}$/.test(cleanId)) {
        return client.users.fetch(cleanId).catch(() => null);
    }
    return null;
}

module.exports = {
    name: 'ban',
    description: 'Banea a un usuario del servidor',
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Banea a un miembro o usuario (mención, ID o nombre)')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName('user').setDescription('Usuario (mención)').setRequired(false))
        .addStringOption(o => o.setName('target').setDescription('ID o nombre (si no usas user)').setRequired(false))
        .addStringOption(o => o.setName('reason').setDescription('Razón').setRequired(false))
        .addIntegerOption(o => o.setName('days').setDescription('Días de mensajes a borrar (0-7)').setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();
        try {
            const guild = interaction.guild;
            const userOption = interaction.options.getUser('user');
            const targetInput = interaction.options.getString('target');
            const reason = interaction.options.getString('reason') || 'No especificada';
            const days = Math.max(0, Math.min(7, interaction.options.getInteger('days') || 0));

            let userToBan = userOption || (targetInput ? await resolveUser(interaction.client, targetInput) : null);

            if (!userToBan) {
                return interaction.editReply('❌ No se encontró el usuario (usa mención o ID)');
            }

            if (userToBan.id === interaction.user.id) {
                return interaction.editReply('❌ No puedes banearte a ti mismo');
            }

            const me = await guild.members.fetchMe();
            if (!me.permissions.has('BanMembers')) {
                return interaction.editReply('❌ No tengo permiso de banear');
            }

            const memberToBan = await guild.members.fetch(userToBan.id).catch(() => null);
            if (memberToBan && memberToBan.roles.highest.position >= me.roles.highest.position) {
                return interaction.editReply('❌ No puedo banear a ese miembro por jerarquía');
            }

            await guild.bans.create(userToBan.id, {
                deleteMessageDays: days,
                reason: `${reason} — por ${interaction.user.tag}`
            });
            await interaction.editReply(`✅ Baneado: ${userToBan.tag} (${userToBan.id})\nRazón: ${reason}\nMensajes borrados: ${days} días`);
        } catch (err) {
            logger.error('Ban command error:', err);
            return interaction.editReply('❌ Error al banear al usuario');
        }
    }
};