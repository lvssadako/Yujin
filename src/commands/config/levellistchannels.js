const { SlashCommandBuilder } = require('discord.js');
const { readConfig } = require('../../utils/configCache');

module.exports = {
    name: 'levellistchannels',
    description: 'Lista los canales configurados para ganar experiencia',
    data: new SlashCommandBuilder()
        .setName('levellistchannels')
        .setDescription('Lista los canales configurados para ganar experiencia'),
    async execute(interaction) {
        const config = readConfig();
        const channels = config.channels || {};

        if (Object.keys(channels).length === 0) {
            return interaction.reply('⚠️ No hay canales configurados.');
        }

        const channelList = Object.entries(channels)
            .map(([id, multiplier]) => `<#${id}>: x${multiplier}`)
            .join('\n');

        return interaction.reply(`📋 Canales configurados:\n${channelList}`);
    },

    async executePrefix(message, args, client) {
        const config = readConfig();
        const channels = config.channels || {};

        if (Object.keys(channels).length === 0) {
            return message.reply('⚠️ No hay canales configurados para XP extra.');
        }

        const channelList = Object.entries(channels)
            .map(([id, multiplier]) => `• <#${id}>: **x${multiplier}**`)
            .join('\n');

        return message.reply(`📋 **Canales de XP configurados:**\n${channelList}`);
    }
};
