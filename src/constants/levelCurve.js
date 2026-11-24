// Curva de experiencia única del bot: XP necesaria para pasar del nivel `level` al siguiente.
// Antes estaba copiada en cinco archivos; cualquier cambio debe hacerse solo aquí.
function xpToNext(level) {
  return Math.round(200 * Math.pow(level + 1, 1.4));
}

module.exports = { xpToNext };
