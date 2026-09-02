const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x5865f2,    // Blurple
  blurple: 0x5865f2,    // Blurple
  success: 0x2ecc71,    // Green
  error: 0xe74c3c,      // Red
  info: 0x3498db,       // Blue
  warning: 0xf39c12,    // Orange
  boost: 0xf47fff,      // Pink/Magenta
  level: 0x9b59b6,      // Purple
  economy: 0xf1c40f,    // Gold
  neutral: 0x34495e,    // Dark gray
};

function createSuccessEmbed(title = 'Éxito', description = '') {
  return new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createErrorEmbed(title = 'Error', description = '') {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createInfoEmbed(title = 'Información', description = '') {
  return new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createWarningEmbed(title = 'Advertencia', description = '') {
  return new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function createBoostEmbed(user = null, description = '') {
  const embed = new EmbedBuilder()
    .setColor(COLORS.boost)
    .setDescription(description)
    .setTimestamp();

  if (user && typeof user.username === 'string') {
    embed.setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL?.({ dynamic: true })
    });
  }

  return embed;
}

function createLevelEmbed(user = null, level = 0, description = '') {
  const embed = new EmbedBuilder()
    .setColor(COLORS.level)
    .setDescription(description || `:tada: <@${user?.id}> subió al nivel **${level}**!`)
    .setTimestamp();

  if (user) {
    embed.setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL?.({ dynamic: true })
    });
  }

  return embed;
}

function createEconomyEmbed(title = 'Economía', description = '', user = null) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.economy)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (user) {
    embed.setAuthor({
      name: user.username,
      iconURL: user.displayAvatarURL?.({ dynamic: true })
    });
  }

  return embed;
}

function createNeutralEmbed(title = '', description = '') {
  return new EmbedBuilder()
    .setColor(COLORS.neutral)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

module.exports = {
  COLORS,
  createSuccessEmbed,
  createErrorEmbed,
  createInfoEmbed,
  createWarningEmbed,
  createBoostEmbed,
  createLevelEmbed,
  createEconomyEmbed,
  createNeutralEmbed,
};
