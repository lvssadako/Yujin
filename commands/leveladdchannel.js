const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, ChannelType } = require('discord.js');

const configPath = path.join(__dirname, '..', 'data', 'config.json');

function readConfig() {
    try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { return {}; }
}
function writeConfig(config) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = {
    name: 'leveladdchannel',
    description: 'Agrega un canal para ganar más experiencia',
    data: new SlashCommandBuilder()
        .setName('leveladdchannel')
        .setDescription('Agrega un canal para ganar más experiencia')
        .addChannelOption(opt => opt.setName('channel').setDescription('Canal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice).setRequired(true))
        .addNumberOption(opt => opt.setName('multiplier').setDescription('Multiplicador de XP').setRequired(true)),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const multiplier = interaction.options.getNumber('multiplier');

        const config = readConfig();
        config.channels = config.channels || {};
        config.channels[channel.id] = multiplier;

        writeConfig(config);
        return interaction.reply(`✅ Canal ${channel} agregado con multiplicador de XP x${multiplier}`);
    }
};