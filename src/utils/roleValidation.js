const { PermissionFlagsBits } = require('discord.js');
const logger = require('./logger');

// Permisos que un rol repartido automáticamente (tienda, estado, etc.) nunca debe tener: serían una escalada de privilegios.
const DANGEROUS_PERMISSIONS = [
  'Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'ManageWebhooks', 'BanMembers', 'KickMembers',
  'ModerateMembers', 'MentionEveryone', 'ManageMessages', 'ManageNicknames', 'ManageGuildExpressions', 'ViewAuditLog'
].map(name => PermissionFlagsBits[name]).filter(flag => flag !== undefined);

function hasDangerousPermissions(role) {
  const perms = role?.permissions;
  if (!perms || typeof perms.has !== 'function') return false;
  return DANGEROUS_PERMISSIONS.some(flag => perms.has(flag));
}
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

function validateRoleForAssignment(guild, roleId, context = '', { rejectDangerous = false } = {}) {
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

  if (rejectDangerous && hasDangerousPermissions(role)) {
    return { valid: false, reason: `Role **${role.name}** has administrative or moderation permissions and cannot be granted automatically.`, dangerous: true };
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
  DANGEROUS_PERMISSIONS,
  hasDangerousPermissions,
  canBotManageRole,
  validateRoleForAssignment,
  validateRolesForAssignment,
};
