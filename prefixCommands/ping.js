module.exports = {
  name: 'ping',
  execute: async (message, args, client) => {
    await message.reply('🏓 Pong!');
  }
};
