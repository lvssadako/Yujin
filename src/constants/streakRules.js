// Reglas compartidas del sistema de rachas (sin dependencias para evitar ciclos).

// La racha solo se considera activa (visible, con beneficios, recompensas y avisos)
// a partir de este número de días consecutivos.
const STREAK_ACTIVATION_DAYS = 5;

// Versión de la migración de preferencias de racha. Se guarda en cada perfil
// (u.streakPrefsVersion) para que la validación se aplique una sola vez.
const STREAK_PREFS_VERSION = 2;

module.exports = { STREAK_ACTIVATION_DAYS, STREAK_PREFS_VERSION };
