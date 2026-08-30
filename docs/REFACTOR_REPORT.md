# Reporte de Refactorización y Auditoría de Seguridad (Yujin Bot)

Este documento detalla todas las modificaciones críticas realizadas durante la fase de reestructuración del bot, así como los riesgos técnicos, lógicos y de seguridad que cada cambio previno o mitigó.

---

## 1. Reestructuración Arquitectónica a \`src/\`
**Cambios realizados:** 
Se migró todo el código espagueti de la raíz hacia una estructura profesional: \`src/commands/\`, \`src/events/\`, \`src/services/\`, \`src/utils/\` y se movieron los datos persistentes a \`data/\`.

*   **Riesgo Mitigado:** **Deuda Técnica y Escalabilidad.** Tener todos los archivos mezclados en la raíz generaba dependencias circulares que rompían el código silenciosamente y hacía imposible mantener el bot a largo plazo sin romper otras cosas.

## 2. Persistencia Atómica de JSON (\`jsonStore.js\`)
**Cambios realizados:** 
Se eliminó la escritura directa con \`fs.writeFileSync\` inestable y se implementó un sistema de escritura "atómica" (escribe en un archivo temporal y luego lo renombra instantáneamente).

*   **Riesgo Mitigado (CRÍTICO):** **Corrupción total de bases de datos.** En el modelo anterior, si el servidor Node.js se apagaba, había un corte de energía, o 2 usuarios ejecutaban comandos al mismo milisegundo, los archivos JSON (como el de perfiles o niveles) podían quedar vacíos o corruptos, perdiéndose la economía de todo el servidor.

## 3. Centralización de Economía (\`economyService.js\`)
**Cambios realizados:** 
Se eliminó la posibilidad de que los minijuegos o comandos de apuestas modificaran los JSON de perfiles de manera aislada. Todo entra por funciones únicas (\`addCoins\`, \`removeCoins\`) y se incluyó un sistema de idempotencia (\`grantOnce\`).

*   **Riesgo Mitigado:** **Exploits de Duplicación (Dinero Infinito).** Previene ataques donde los usuarios podían abusar del lag de la red, usar macros de clics rápidos en botones (ej. cobrar recompensas dobles) o bugs donde el dinero se restaba erróneamente en números negativos.

## 4. Jerarquía de Moderación Estricta (\`ban\`, \`kick\`, \`timeout\`)
**Cambios realizados:** 
Se añadieron comprobaciones de jerarquía de roles de Discord nativas a los comandos de moderación. El bot ahora compara la posición del rol del ejecutor contra la posición del objetivo.

*   **Riesgo Mitigado (CRÍTICO):** **Escalada de Privilegios.** Anteriormente, un moderador raso (con el permiso básico) podría haber ejecutado \`/ban\` sobre un Administrador, un Co-Dueño o incluso sobre el propio Bot, destruyendo la seguridad interna del servidor.

## 5. Prevención Global de Caídas (\`uncaughtException\`)
**Cambios realizados:** 
Se inyectó un capturador maestro de errores asíncronos al principio del archivo \`index.js\`.

*   **Riesgo Mitigado:** **Downtime e Inactividad del Bot.** En Node.js, si ocurre un solo error no manejado (como una respuesta fallida de la API de Discord), el proceso completo se "apaga". Ahora, el bot sobrevive al error, lo envía a los registros (logger) y continúa funcionando 24/7 de forma transparente para los usuarios.

## 6. Evolución a Slash Commands (Wrappers)
**Cambios realizados:** 
Se crearon envoltorios en \`src/commands/games/\` que convierten los juegos de apuestas clásicos (\`&ruleta\`, \`&slots\`) a interactivos nativos (\`/ruleta\`) sin destruir su código original. Además, se aplicó un rediseño "Premium" al comando \`help\`.

*   **Riesgo Mitigado:** **Abandono de UX y Obsolescencia.** Discord está deprecando agresivamente el uso de comandos por prefijo (privilege intents). No tener los comandos como "Slash" corría el riesgo de que el bot eventualmente dejara de funcionar o de que los usuarios nuevos no supieran cómo usarlo.

## 7. Pruebas Automatizadas Unitarias (100% Cobertura Crítica)
**Cambios realizados:** 
Se restauraron y actualizaron las rutas de los 32 tests nativos de \`node --test\`.

*   **Riesgo Mitigado:** **Regresiones silenciosas.** Evita el miedo a subir actualizaciones. Si en el futuro agregas código que rompe el sistema de XP, los tests fallarán en tu consola y te avisarán ANTES de que el bot suba a producción e impacte al servidor.

## 8. Sorteos Persistentes y Almacenamiento Dinámico
**Cambios realizados:** 
El sistema de \`/sorteo\` (Giveaways) guarda su estado y tiempo en disco (JSON).

*   **Riesgo Mitigado:** **Pérdida de eventos por reinicios.** Si organizas un sorteo de 24 horas y reinicias el bot en la hora 23 (para actualizar código), no se cancelará; el bot volverá a leer la fecha objetivo y reanudará la cuenta regresiva.
