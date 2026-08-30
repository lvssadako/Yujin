const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const configPath = path.join(__dirname, '..', 'data', 'config.json');

function readConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return {}; }
}

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
    }
};