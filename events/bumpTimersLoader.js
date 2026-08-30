// Cargar y reprogramar timers de bump pendientes al iniciar el bot
const { readTimers, removeTimer } = require('../utils/bumpTimers');

module.exports = (client) => {
  const timers = readTimers();
  const now = Date.now();
  for (const timer of timers) {
    const delay = timer.sendAt - now;
    if (delay > 0) {
      setTimeout(async () => {
        const channel = await client.channels.fetch(timer.channelId).catch(() => null);
        if (channel) {
          channel.send({
            content: `<@&${timer.roleId}> ¡Es hora de hacer /bump de nuevo! Usa /bump para apoyar el servidor.`
          });
        }
        removeTimer(timer.id);
      }, delay);
    } else {
      // Si el tiempo ya pasó, elimina el timer
      removeTimer(timer.id);
    }
  }
};
