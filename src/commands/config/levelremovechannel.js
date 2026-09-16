const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { readConfig, writeConfig } = require('../../utils/configCache');

module.exports = {
    name: 'levelremovechannel',
    description: 'Remueve un canal de la lista de experiencia',
    data: new SlashCommandBuilder()
        .setName('levelremovechannel')
        .setDescription('Remueve un canal de la lista de experiencia')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('Canal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice).setRequired(true)),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const config = readConfig();
        if (config.channels && Object.prototype.hasOwnProperty.call(config.channels, channel.id)) {
            writeConfig(current => {
                const next = { ...current, channels: { ...(current.channels || {}) } };
                delete next.channels[channel.id];
                return next;
            });
            return interaction.reply(`✅ Canal ${channel} removido de la lista.`);
        } else {
            return interaction.reply(`⚠️ El canal ${channel} no está en la lista.`);
        }
    },

    async executePrefix(message, args, client) {
        if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ No tienes permisos de administrador.');
        }
        const channel = message.mentions.channels.first() || (args[0] ? await message.guild.channels.fetch(args[0]).catch(() => null) : null);
        if (!channel) return message.reply('❌ Uso: `&levelremovechannel #canal`');
        const config = readConfig();
        if (config.channels && Object.prototype.hasOwnProperty.call(config.channels, channel.id)) {
            writeConfig(current => {
                const next = { ...current, channels: { ...(current.channels || {}) } };
                delete next.channels[channel.id];
                return next;
            });
            return message.reply(`✅ Canal <#${channel.id}> removido de la lista.`);
        } else {
            return message.reply(`⚠️ El canal <#${channel.id}> no está en la lista.`);
        }
    }
};
