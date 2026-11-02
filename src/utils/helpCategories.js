const { COLORS } = require("./ui");
const COMMAND_MAP = {
  // Panel de Desarrollo y Owner (Exclusivo)
  dev: 'dev',
  host: 'dev',
  logs: 'dev',
  reload: 'dev',
  restart: 'dev',
  resetloan: 'dev',
  testboost: 'dev',
  testbutton: 'dev',
  testsecurity: 'dev',

  // Moderación y Seguridad
  addmoney: 'admin',
  ban: 'admin',
  unban: 'admin',
  kick: 'admin',
  timeout: 'admin',
  warn: 'admin',
  clear: 'admin',
  automod: 'admin',
  audit: 'admin',
  ecoadmin: 'admin',

  // Economía y Finanzas
  balance: 'economy',
  bal: 'economy',
  bank: 'economy',
  daily: 'economy',
  work: 'economy',
  fish: 'economy',
  rob: 'economy',
  loan: 'economy',
  pay: 'economy',
  transfer: 'economy',
  shop: 'economy',
  buy: 'economy',
  chest: 'economy',
  top: 'economy',
  ecotop: 'economy',

  // Casino y Minijuegos
  blackjack: 'games',
  ruleta: 'games',
  slots: 'games',
  coinflip: 'games',
  crash: 'games',
  reactduel: 'games',

  // Niveles, Perfiles y Rachas
  level: 'level',
  profile: 'level',
  profileset: 'level',
  badge: 'level',
  leaderboard: 'level',
  streak: 'level',
  racha: 'level',
  streaks: 'level',
  streaknotif: 'level',
  streakcheck: 'utility',

  // Boosters y Servidor
  boosters: 'boost',
  boostsxp: 'boost',
  boostxp: 'boost',
  boostercolors: 'boost',

  // Configuración del Servidor
  setchannel: 'config',
  setboostchannel: 'config',
  setlevelchannel: 'config',
  setbumpreminder: 'config',
  leveladmin: 'config',
  levelrewards: 'config',
  leveladdchannel: 'config',
  levelremovechannel: 'config',
  levellistchannels: 'config',
  toproles: 'config',
  menuconfig: 'config',

  // Utilidades y Comunidad
  help: 'utility',
  info: 'utility',
  userinfo: 'utility',
  sorteo: 'utility',
  reminder: 'utility',
  bumpreminderinfo: 'utility',
  manage: 'utility',
  ping: 'utility'
};
module.exports = { COMMAND_MAP };
