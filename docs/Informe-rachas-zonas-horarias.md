# Corrección de rachas por zona horaria · 29 de septiembre de 2026

Las rachas usan la medianoche (12:00 a. m.) de la zona elegida por cada persona.
Ciudad de México (America/Mexico_City) es la zona por defecto.

## Uso

- /streak zona nombre:America/Mexico_City
- &streak zona America/Mexico_City
- /racha zona y &racha zona tienen el mismo comportamiento.
- Sin nombre, el comando muestra la zona actual y el próximo cambio de día.
- La opción slash sugiere ciudades y zonas. Se puede cambiar una vez cada 24 horas.
- La preferencia se aplica al usuario en todos los servidores del bot.
- Las zonas con horario de verano ajustan automáticamente su medianoche.

## Correcciones

- La actividad se registra antes de los retornos por drops, anuncios duplicados y errores de niveles.
- Los recordatorios vuelven a consultar la actividad después de consultar a Discord.
- El envío de un recordatorio actualiza sus propios campos sobre los datos recientes.
- Un recordatorio ya no puede sobrescribir una racha incrementada durante el envío.
- Los fallos de envío permiten reintentar; los envíos exitosos se deduplican.
- Premios y consumo de congeladores incluyen recuperación tras un fallo de almacenamiento.
- Cambiar de zona conserva la racha y no concede un día o premio adicional.
- La tarjeta de perfil y los comandos de racha consultan el mismo calendario personal.

## Datos existentes

Los registros anteriores guardaban un día y un desplazamiento fijo, sin la hora del mensaje.
La migración conserva el contador y aplica una tolerancia acotada para evitar romper rachas
al cambiar desde ese calendario. No inventa mensajes ni restaura masivamente rachas.
La revisión de las copias disponibles no encontró una pérdida generalizada de rachas.
Esta revisión no permite descartar todos los casos individuales.

## Validación

408 pruebas aprobadas, 0 fallos. Revisión de sintaxis: 236 archivos JavaScript.
Se probaron medianoches en México, Madrid, Tokio y Nepal; días de 23 y 25 horas;
mensajes simultáneos con recordatorios; cambios de zona; fallos de almacenamiento;
premios y congeladores; reinicio de recordatorios; paridad slash/prefijo y alias.
Las pruebas se realizaron en un proyecto aislado, sin ejecutar contra los datos en producción.
