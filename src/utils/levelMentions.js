// Los avisos de subida de nivel muestran @rol pero NUNCA lo notifican: el rol queda como
// mención "silenciosa". Solo se puede notificar al propio usuario que subió de nivel.
function levelUpAllowedMentions(userId) {
  const users = /^\d{5,25}$/.test(String(userId || '')) ? [String(userId)] : [];
  return { parse: [], roles: [], users, repliedUser: false };
}

module.exports = { levelUpAllowedMentions };
