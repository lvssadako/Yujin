const config = require('../config.json');

async function sendToLogChannel(client, content) {
  if (!config.logChannelId) return;
  const channel = await client.channels.fetch(config.logChannelId).catch(() => null);
  if (channel && channel.isTextBased()) await channel.send(content);
}

async function sendToMfaChannel(client, content, components) {
  if (!config.mfaChannelId) return;
  const channel = await client.channels.fetch(config.mfaChannelId).catch(() => null);
  if (channel && channel.isTextBased()) await channel.send({ content, components });
}

async function sendToAlertChannel(client, content) {
  if (!config.alertChannelId) return;
  const channel = await client.channels.fetch(config.alertChannelId).catch(() => null);
  if (channel && channel.isTextBased()) await channel.send(content);
}

module.exports = { sendToLogChannel, sendToMfaChannel, sendToAlertChannel };