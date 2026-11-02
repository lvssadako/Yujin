# Restauración de rachas · 29 de septiembre de 2026

Se compararon siete respaldos diarios de perfiles y niveles y dos copias completas
anteriores a las actualizaciones. Una copia parcial de otro entorno se excluyó de
las decisiones de restauración.

## Hallazgos comprobados

Una racha de 18 días conservaba una marca de inactividad de 15 días pese a tener
actividad reciente. Al día siguiente se reinició en 1. Los respaldos posteriores
muestran continuidad hasta 6 días, sin otra interrupción.

La corrección recupera los 18 días perdidos: el contador pasa de 6 a 24.
Se conserva la fecha de actividad actual, la zona horaria, las preferencias y los
demás datos de perfil. La operación no entrega de nuevo premios ni consume congeladores.

Dos rachas adicionales se reiniciaron por el calendario UTC. Los registros de niveles
prueban mensajes posteriores a las 11:42 UTC del 28 de septiembre y nuevos mensajes
antes de las 01:30 UTC del 30. En Ciudad de México corresponden a días consecutivos,
28 y 29 de septiembre. Sus contadores se recuperan de 1 a 16 y de 1 a 5.
En total se restauran tres rachas, sin conceder días sin evidencia.

Las otras disminuciones revisadas tienen intervalos sin actividad registrada.
La evidencia disponible no permite atribuirlas a un fallo ni reconstruir todos los
días de esas rachas. No se inventan mensajes para llenar esos intervalos.

## Parche preventivo

Ya estaban aplicadas las correcciones para registrar la actividad antes de los
retornos del evento y para impedir que los recordatorios sobrescriban perfiles recientes.
Se añade protección contra marcas de inactividad incompatibles con actividad de hoy
o ayer y un contador positivo. Las desactivaciones por inactividad real o por otras
causas mantienen su comportamiento.

## Restauración segura

El servicio central ofrece restoreHistoricalStreaks para mantenimiento por el operador.
Requiere un plan con usuario, servidor, días perdidos y valores actuales esperados.
Rechaza cambios concurrentes, usuarios que ya no tienen una racha activa, duplicados,
contadores inválidos y conflictos de recibos. Cada incidente se registra en el mismo
guardado atómico del perfil; repetir el plan no suma los días otra vez.
Antes de restaurar se recuperan las operaciones de actividad pendientes.

El plan, las copias de respaldo y el registro individual quedan protegidos en la VM.
El paquete para el repositorio contiene el código y las pruebas, sin datos de usuarios.

## Validación

420 pruebas aprobadas, 0 fallos; sintaxis verificada en 236 archivos JavaScript.
