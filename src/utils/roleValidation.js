const logger = require('./utils/logger');
function canBotManageRole(guild, role) {
  if (!role || typeof role !== 'object') return false;
  if (!guild || typeof guild !== 'object') return false;

  const botMember = guild.members.cache.get(guild.client.user.id);
  if (!botMember) return false;

  if (role.managed) {
    logger.warn(`[roleValidation] Role ${role.id} (${role.name}); is managed, bot cannot manage it.`);
    return false;
  }

  if (role.id === guild.roles.everyone.id) {
    logger.warn(`[roleValidation] Role ${role.id} is @everyone, cannot manage.`);
    return false;
  }

  const botHighestRole = botMember.roles.highest;
  if (!botHighestRole || role.comparePositionTo(botHighestRole) > 0) {
    logger.warn(
      `[roleValidation] Role ${role.id} (${role.name}); is above bot's highest role ` +
      `(bot highest: ${botHighestRole?.name || 'none'}).`
    );
    return false;
  }

  return true;
}

function validateRoleForAssignment(guild, roleId, context = '') {
  if (typeof roleId !== 'string' || !roleId.trim()) {
    return { valid: false, reason: 'Role ID is empty or invalid.' };
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    return { valid: false, reason: `Role ${roleId} not found in guild.` };
  }

  if (!canBotManageRole(guild, role)) {
    return { 
      valid: false, 
      reason: `Bot cannot manage role **${role.name}**. Ensure the role is below the bot's highest role and not managed.` 
    };
  }

  return { valid: true, reason: null, role };
}

function validateRolesForAssignment(guild, roleIds, context = '') {
  const valid = [];
  const invalid = [];

  for (const id of roleIds) {
    const result = validateRoleForAssignment(guild, id, context);
    if (result.valid) {
      valid.push(result.role);
    } else {
      invalid.push({ id, reason: result.reason });
    }
  }

  return { valid, invalid };
}

module.exports = {
  canBotManageRole,
  validateRoleForAssignment,
  validateRolesForAssignment,
};
