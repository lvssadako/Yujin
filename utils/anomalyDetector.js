function isUnusualHour(user, actionTime) {
  // Ejemplo: horario fuera de 8am-10pm
  const hour = actionTime.getHours();
  return hour < 8 || hour > 22;
}
function isFirstTimeAction(user, action) {
  // Ejemplo: si nunca hizo esa acción antes
  return !user.actionHistory || !user.actionHistory.includes(action);
}
function isUnusualDay(user, actionTime) {
  // Ejemplo: si nunca estuvo activo ese día
  const day = actionTime.getDay();
  return !user.activeDays || !user.activeDays.includes(day);
}
function isAnomalousSpeed(user, recentActions) {
  // Ejemplo: más de 5 acciones críticas en 1 minuto
  return recentActions.filter(a => a.time > Date.now() - 60000).length > 5;
}
module.exports = { isUnusualHour, isFirstTimeAction, isUnusualDay, isAnomalousSpeed };