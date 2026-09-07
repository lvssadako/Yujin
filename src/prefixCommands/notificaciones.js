const notificacionesCmd = require('../commands/utility/notificaciones');

module.exports = {
  name: 'notificaciones',
  aliases: ['notif', 'dmnotif', 'dms', 'dm'],
  description: 'Gestiona tus preferencias de mensajes directos (DM) del bot.',
  usage: 'notificaciones [estado | on [tipo] | off [tipo]]',
  async execute(message, args, client) {
    return notificacionesCmd.executePrefix(message, args, client);
  }
};
