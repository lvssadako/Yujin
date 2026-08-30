const logger = require('../../utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const cfgPath = path.join(__dirname, '..', 'config.json');

function readConfig() {
    try {
        return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    } catch {
        return {};
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('testboost')
        .setDescription('Verifica la configuración de canales de boost')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const config = readConfig();
            const addedChannel = config.boostAddedChannelId ? 
                interaction.guild.channels.cache.get(config.boostAddedChannelId) : 
                interaction.guild.channels.cache.get(config.boostChannelId);

            const removedChannel = config.boostRemovedChannelId ? 
                interaction.guild.channels.cache.get(config.boostRemovedChannelId) : 
                interaction.guild.channels.cache.get(config.boostChannelId);

            let response = '**Estado de canales de boost:**\n';
            response += `📥 Canal de boosts añadidos: ${addedChannel ? '✅ ' + addedChannel.toString() : '❌ No configurado'}\n`;
            response += `📤 Canal de boosts removidos: ${removedChannel ? '✅ ' + removedChannel.toString() : '❌ No configurado'}\n\n`;
            response += `**IDs configuradas:**\n`;
            response += `⚙️ boostChannelId: \`${config.boostChannelId || 'no configurado'}\`\n`;
            response += `⚙️ boostAddedChannelId: \`${config.boostAddedChannelId || 'no configurado'}\`\n`;
            response += `⚙️ boostRemovedChannelId: \`${config.boostRemovedChannelId || 'no configurado'}\``;

            await interaction.editReply({ content: response });
        } catch (err) {
            logger.error('[testboost] Error:', err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ 
                    content: '❌ Error al verificar configuración de canales de boost', 
                    ephemeral: true 
                });
            } else {
                await interaction.editReply({ 
                    content: '❌ Error al verificar configuración de canales de boost'
                });
            }
        }
    }
};