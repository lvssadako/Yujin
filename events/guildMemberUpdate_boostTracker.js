const fs = require('fs');
const path = require('path');
const { Events, EmbedBuilder } = require('discord.js');

const dataDir = path.join(__dirname, '..', 'data');
const boostsPath = path.join(dataDir, 'boosts.json');
const cfgPath = path.join(__dirname, '..', 'config.json');

function readBoosts() { 
    try { 
        return JSON.parse(fs.readFileSync(boostsPath, 'utf8')); 
    } catch { 
        return {}; 
    } 
}
function writeBoosts(obj) { 
    fs.writeFileSync(boostsPath, JSON.stringify(obj, null, 2), 'utf8'); 
}
function readConfig() { 
    try { 
        return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); 
    } catch { 
        return {}; 
    } 
}

module.exports = (client) => {
    client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
        try {
            const guild = newMember.guild;
            const gid = guild.id;
            const uid = newMember.id;

            const wasBooster = oldMember.premiumSince !== null;
            const isBooster = newMember.premiumSince !== null;

            const oldCount = oldMember.premiumSubscriptionCount || 0;
            const newCount = newMember.premiumSubscriptionCount || 0;
            const boostChange = newCount - oldCount;

            if (!oldMember) return;

            const boosts = readBoosts();
            boosts[gid] = boosts[gid] || {};

            const config = readConfig();
            const addedChannel = config.boostAddedChannelId ? 
                guild.channels.cache.get(config.boostAddedChannelId) : 
                guild.channels.cache.get(config.boostChannelId);

            const removedChannel = config.boostRemovedChannelId ? 
                guild.channels.cache.get(config.boostRemovedChannelId) : 
                guild.channels.cache.get(config.boostChannelId);

            if (boostChange !== 0) {
                boosts[gid][uid] = newCount;
                writeBoosts(boosts);

                const changeText = boostChange > 0 ? `+${boostChange}` : boostChange;
                console.log(`[boostTracker] ${newMember.user.tag} cambió sus boosts (${changeText})`);

                const embed = new EmbedBuilder()
                    .setColor(boostChange > 0 ? '#f47fff' : '#36393f')
                    .setAuthor({
                        name: newMember.user.username,
                        iconURL: newMember.user.displayAvatarURL({ dynamic: true })
                    })
                    .setDescription(
                        `${boostChange > 0 ? '💎' : '💨'} ${
                            !wasBooster && isBooster ? '¡Nuevo Booster!' :
                            wasBooster && !isBooster ? 'Dejó de boostear' :
                            boostChange > 0 ? 'Incrementó sus boosts' : 'Decrementó sus boosts'
                        }\n` +
                        `Boost actual: **${newCount}**\n` +
                        `Incremento: **${changeText}**`
                    )
                    .setTimestamp();

                if (boostChange > 0 && addedChannel) {
                    await addedChannel.send({ embeds: [embed] })
                        .catch(err => console.error('Error enviando notificación de boost añadido:', err));
                } else if (boostChange < 0 && removedChannel) {
                    await removedChannel.send({ embeds: [embed] })
                        .catch(err => console.error('Error enviando notificación de boost removido:', err));
                }
            }

        } catch (e) {
            console.error('[boostTracker] Error:', e);
        }
    });
};