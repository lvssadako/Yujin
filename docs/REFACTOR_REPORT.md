# Reporte de Refactorización y Auditoría de Seguridad (Yujin Bot)

**Contexto del Reporte:** Este documento detalla la evolución arquitectónica y de seguridad desde la **Primera Versión Legacy** (ubicada originalmente en \`C:\\Users\\yooh2\\Documents\\LCOBOT_OLD\`) hasta la actual versión moderna y estructurada en el repositorio activo.

---

## 1. Reestructuración Arquitectónica a \`src/\`
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Las carpetas críticas como \`commands\`, \`events\`, \`utils\`, \`tests\` y el archivo \`index.js\` estaban tirados directamente en la raíz del proyecto. Los archivos de datos (JSONs) se creaban indiscriminadamente junto al código fuente.

**Estado Actual:** 
Se migró todo a un entorno aislado y profesional \`src/\` subdividido lógicamente en \`commands/\`, \`events/\`, \`services/\`, \`utils/\`. Los datos de estado se aislaron en su propia carpeta \`data/\`.

*   **Riesgo Mitigado:** **Deuda Técnica y Exposición de Datos.** Mezclar código fuente con bases de datos causaba dependencias circulares, hacía imposible dockerizar el bot o subirlo a un hosting limpiamente, y corría el riesgo de subir bases de datos completas a repositorios públicos por error.

## 2. Persistencia Atómica de JSON (\`jsonStore.js\`)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Se utilizaba \`fs.writeFileSync\` para guardar niveles, perfiles y dinero.

**Estado Actual:** 
Se desarrolló \`jsonStore.js\` que aplica escrituras "atómicas" (escribe primero en un archivo \`.tmp\` y luego lo renombra).

*   **Riesgo Mitigado (CRÍTICO):** **Corrupción total de bases de datos.** En \`LCOBOT_OLD\`, un corte de energía, una falla de Node.js o 2 usuarios ejecutando un comando al mismo milisegundo podían interceptar el guardado, dejando el JSON vacío (\`0 bytes\`) y borrando la economía y los perfiles de todos los miembros del servidor sin forma de recuperarlos.

## 3. Centralización de Economía (\`economyService.js\`)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Comandos sueltos (como los minijuegos en \`prefixCommands/\`) sumaban y restaban monedas leyendo y sobrescribiendo \`profiles.json\` directamente cada uno por su cuenta.

**Estado Actual:** 
Todo flujo de monedas debe pasar obligatoriamente por un "banco central" (\`src/services/economy/index.js\`), el cual valida los fondos e implementa protecciones de idempotencia (\`grantOnce\`).

*   **Riesgo Mitigado:** **Exploits de Duplicación (Dinero Infinito).** Anteriormente, los usuarios podían abusar del lag o usar macros para reclamar recompensas múltiples veces antes de que el archivo JSON se cerrara. Esto devaluaba totalmente la economía.

## 4. Jerarquía de Moderación Estricta (\`ban\`, \`kick\`, \`timeout\`)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Los comandos administrativos simplemente revisaban si el usuario tenía el permiso general de "Banear" o "Expulsar", pero no comprobaban su jerarquía en el servidor.

**Estado Actual:** 
El código calcula la posición del rol más alto del usuario que ejecuta el comando vs la posición del rol más alto de la víctima, bloqueando el ataque si la víctima es igual o superior.

*   **Riesgo Mitigado (CRÍTICO):** **Escalada de Privilegios.** En el bot original, un moderador nuevo o hackeado podría haber baneado a los Administradores o al Dueño del servidor, destruyendo la comunidad desde adentro.

## 5. Prevención Global de Caídas (\`uncaughtException\`)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Cualquier error de conexión a internet o de la API de Discord hacía que el proceso \`node index.js\` crasheara.

**Estado Actual:** 
Se inyectaron manejadores globales de errores asíncronos en el núcleo del bot.

*   **Riesgo Mitigado:** **Downtime e Inactividad del Bot.** Si ocurría un fallo a las 3:00 AM, el bot se desconectaba hasta que el dueño despertara para volver a encenderlo. Ahora, el bot sobrevive al error, lo envía a los registros (logger) y continúa funcionando 24/7.

## 6. Evolución a Slash Commands (Wrappers)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Los sistemas principales (ruleta, slots, coinflip) estaban obsoletos y programados únicamente como comandos de texto (\`&\`).

**Estado Actual:** 
Se desarrollaron wrappers en \`src/commands/games/\` para transformar el código legado en *Slash Commands* nativos, incluyendo una UI premium interactiva para \`/help\`.

*   **Riesgo Mitigado:** **Deprecación por parte de Discord.** Discord está limitando severamente la lectura de mensajes (Privileged Intents) para bots de texto. Seguir usando el modelo antiguo garantizaba que el bot dejara de funcionar a medida que creciera.

## 7. Automatización de Tests (100% Cobertura)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Los tests en la carpeta \`tests/\` no cubrían los flujos complejos y las rutas estaban rotas al cambiar de carpetas.

**Estado Actual:** 
Se reconstruyó la suite de Node.js test runner con 32 validaciones estrictas.

*   **Riesgo Mitigado:** **Regresiones silenciosas.** Se previno el riesgo de subir código nuevo que, por error, rompiera módulos críticos que ya funcionaban bien.

## 8. Nuevas Funciones Seguras (Sorteos, Trabajo, Warns)
**Estado en la Versión Antigua (\`LCOBOT_OLD\`):** 
Carecía de moderación preventiva y los usuarios no tenían formas activas de ganar dinero más allá de un daily y juegos de azar.

**Estado Actual:** 
Se construyó un sistema de advertencias locales persistentes (\`warns.json\`), métodos seguros de ganar dinero (\`/work\`, \`/rob\`), y un gestor dinámico de sorteos (\`giveawayManager\`) que sobrevive a los reinicios.
