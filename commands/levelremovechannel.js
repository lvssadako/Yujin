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
    name: 'levelremovechannel',
    description: 'Remueve un canal de la lista de experiencia',
    data: new SlashCommandBuilder()
        .setName('levelremovechannel')
        .setDescription('Remueve un canal de la lista de experiencia')
        .addChannelOption(opt => opt.setName('channel').setDescription('Canal').addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice).setRequired(true)),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const config = readConfig();
        if (config.channels && config.channels[channel.id]) {
            delete config.channels[channel.id];
            writeConfig(config);
            return interaction.reply(`✅ Canal ${channel} removido de la lista.`);
        } else {
            return interaction.reply(`⚠️ El canal ${channel} no está en la lista.`);
        }
    }
};