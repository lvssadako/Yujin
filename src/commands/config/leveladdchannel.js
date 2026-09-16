const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { writeConfig } = require('../../utils/configCache');

module.exports = {
    name: 'leveladdchannel',
    description: 'Agrega un canal para ganar más experiencia',
    data: new SlashCommandBuilder()
        .setName('leveladdchannel')
        .setDescription('Agrega un canal para ganar más experiencia')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('Canal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice).setRequired(true))
        .addNumberOption(opt => opt.setName('multiplier').setDescription('Multiplicador de XP').setRequired(true)),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const multiplier = interaction.options.getNumber('multiplier');

        if (!Number.isFinite(multiplier) || multiplier <= 0) {
            return interaction.reply('❌ El multiplicador debe ser un número finito mayor que cero.');
        }

        writeConfig(current => ({
            ...current,
            channels: {
                ...(current.channels || {}),
                [channel.id]: multiplier
            }
        }));
        return interaction.reply(`✅ Canal ${channel} agregado con multiplicador de XP x${multiplier}`);
    },

    async executePrefix(message, args, client) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ No tienes permisos de administrador.');
        }
        const channel = message.mentions.channels.first() || (args[0] ? await message.guild.channels.fetch(args[0]).catch(() => null) : null);
        const multiplier = parseFloat(args[1]);
        if (!channel || !Number.isFinite(multiplier) || multiplier <= 0) {
            return message.reply('❌ Uso: `&leveladdchannel #canal <multiplicador>`\n*Ejemplo:* `&leveladdchannel #general 1.5`');
        }
        writeConfig(current => ({
            ...current,
            channels: {
                ...(current.channels || {}),
                [channel.id]: multiplier
            }
        }));
        return message.reply(`✅ Canal <#${channel.id}> agregado con multiplicador de XP x${multiplier}.`);
    }
};
