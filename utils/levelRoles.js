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

/**
 * Manages level roles for a member based on their current level
 * @param {GuildMember} member - The guild member to manage roles for
 * @param {number} currentLevel - The member's current level
 * @returns {Promise<void>}
 */
async function handleLevelRoles(member, currentLevel) {
    try {
        const cfg = readConfig();
        const levelRewards = cfg.levelRewards || {};
        
        // Convert level requirements to numbers and sort descending
        const levels = Object.keys(levelRewards)
            .map(Number)
            .sort((a, b) => b - a);

        // Find highest level role they qualify for
        let highestQualifiedRoleId = null;
        for (const level of levels) {
            if (currentLevel >= level) {
                highestQualifiedRoleId = levelRewards[level];
                break;
            }
        }

        // Get all level roles configured
        const allLevelRoleIds = Object.values(levelRewards);
        
        // Get level roles the member currently has
        const memberLevelRoles = member.roles.cache.filter(role => 
            allLevelRoleIds.includes(role.id)
        );

        // Remove all current level roles
        if (memberLevelRoles.size > 0) {
            await member.roles.remove(memberLevelRoles);
            console.log(`[ROLES] Removed ${memberLevelRoles.size} level roles from ${member.user.tag}`);
        }

        // Add new role if they qualify
        if (highestQualifiedRoleId) {
            const role = await member.guild.roles.fetch(highestQualifiedRoleId);
            if (role) {
                await member.roles.add(role);
                console.log(`[ROLES] Added level ${currentLevel} role to ${member.user.tag}`);
            }
        }

    } catch (err) {
        console.error('[ROLES] Error managing level roles:', err);
    }
}

module.exports = { handleLevelRoles };