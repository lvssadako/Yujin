const logger = require('./logger');
async function validateChannelForSending(guild, channelId, context = '') {
  if (typeof channelId !== 'string' || !channelId.trim()) {
    return { valid: false, reason: 'Channel ID is empty or invalid.' };
  }

  let channel;
  try {
    channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  } catch (e) {
    logger.warn(`[channelValidation] Failed to fetch channel ${channelId}:`, e?.message);
    return { valid: false, reason: `Channel ${channelId} not found or unreachable.` };
  }

  if (!channel) {
    return { valid: false, reason: `Channel ${channelId} does not exist.` };
  }

  if (!channel.isTextBased()) {
    return { valid: false, reason: `Channel <#${channel.id}> is not a text channel.` };
  }

  const bot = guild.members.cache.get(guild.client.user.id);
  if (!bot) {
    return { valid: false, reason: `Bot member not found in guild.` };
  }

  const perms = channel.permissionsFor(bot);
  if (!perms) {
    return { valid: false, reason: `Bot has no permission data for <#${channel.id}>.` };
  }

  if (!perms.has(['SendMessages', 'EmbedLinks'])) {
    const missing = [];
    if (!perms.has('SendMessages')) missing.push('SendMessages');
    if (!perms.has('EmbedLinks')) missing.push('EmbedLinks');
    return { 
      valid: false, 
      reason: `Bot lacks permissions in <#${channel.id}>: ${missing.join(', ')}` 
    };
  }

  return { valid: true, reason: null, channel };
}

async function getValidNotificationChannel(guild, ...channelIds) {
  for (const id of channelIds) {
    if (!id) continue;
    const validation = await validateChannelForSending(guild, id);
    if (validation.valid) return validation.channel;
  }
  return null;
}

module.exports = {
  validateChannelForSending,
  getValidNotificationChannel,
};
