# AGENTS.md

## Propósito

Este documento define las reglas y buenas prácticas que deben seguirse al trabajar en este proyecto para evitar regresiones, duplicación de trabajo y errores ya detectados.

## Contexto del proyecto

- Bot de Discord para comunidad
- Node.js + Discord.js v14
- persistencia local en JSON dentro de `data/`
- arquitectura modular con `commands/`, `events/`, `utils/`, `prefixCommands/`
- uso de Canva / canvas para perfiles visuales

## Reglas obligatorias

### 1. No escribir JSON crítico sin servicio central

Nunca se debe hacer una escritura directa de archivos de estado crítico desde:

- comandos
- eventos
- módulos sueltos
- utilidades improvisadas

Si el dato es importante (economía, perfiles, niveles, boosts, config), debe entrar por un servicio o utilitario central.

### 2. Validar antes de guardar o ejecutar

Antes de:

- restar monedas
- sumar XP
- asignar roles
- aceptar URLs externas
- tocar configuración

se debe validar:

- tipo de dato
- rango permitido
- permisos del usuario
- permisos del bot
- contexto del servidor

### 3. Mantener idempotencia de recompensas

No se deben repetir recompensas por eventos duplicados o multiple triggers.

Regla:

- cada recompensa debe identificar origen y tipo
- cualquier flujo de evento debe poder deduplicarse por clave `guild:user:event`

### 4. No introducir estado global sin control

Evitar usar `global` para lógica de negocio cuando hay una alternativa con servicio o `Map` controlado.

Si se usa `Map` o `global`, debe tener:

- TTL
- limpieza explícita
- control de reinicio
- pruebas asociadas

### 5. Segmentar diseño visual

Cada embed debe seguir un patrón consistente. No crear embeds sueltos con estilos distintos sin un factory o patrón común.

### 6. Mantener mensajes claros y accionables

Los mensajes del bot deben:

- ser directos
- explicar la causa y el siguiente paso
- reducir ambigüedad
- no exponer detalles internos del sistema

### 7. Dualidad Obligatoria: Slash Commands y Comandos con Prefijo

Todo comando nuevo o refactorizado debe contar obligatoriamente con compatibilidad dual:

- `execute(interaction, client)`: Manejo de Slash Command (`/comando`).
- `executePrefix(message, args, client)`: Manejo de Prefijo (`&comando`).
- Ambos métodos deben mantener paridad de subcomandos, validación de permisos y formato visual.

### 8. Autenticación Centralizada de Staff y Protección de `.env`

- **Jamás solicitar ni acceder directamente al archivo `.env`**. El acceso a variables de entorno se realiza exclusivamente en runtime vía `process.env`.
- Toda verificación de privilegios exclusivos para Dueño (Owner) o Desarrollador (Developer) debe realizarse mediante [`src/utils/staffAuth.js`](file:///C:/Users/yooh2/Documents/LCOBOT/src/utils/staffAuth.js) (`isOwnerOrDev`, `isOwner`, `isDeveloper`).
- Los comandos exclusivos de desarrollo no deben ser visibles en `/help` ni exponerse a usuarios que no posean los IDs correspondientes en `OWNER_ID` o `DEVELOPER_ID`.

### 9. Censura de Secretos y Manejo Seguro de Diagnósticos

- En utilidades de inspección o `eval`, jamás exponer en chat ni en embeds datos sensibles como `TOKEN` de Discord, secretos de Webhook o claves de API (`[REDACTED]`).

### 10. Estabilidad Financiera y Techo de Deuda en Préstamos

- Todo cálculo de intereses debe respetar el intervalo de 24 horas por préstamo (`TICK_INTERVAL_MS`) e imponer el techo de deuda máximo (`MAX_DEBT_MULTIPLIER = 2.5`).
- El scheduler de préstamos se ejecuta cada 1 hora de forma idempotente, verificando el tiempo transcurrido por usuario sin duplicar cobros tras reinicios del bot.

## Problemas ya detectados y que NO deben repetirse

- escritura directa a JSON en varios lugares sin validación
- recompensas duplicadas por eventos múltiples
- canales de notificación ambiguos o compartidos sin prioridad clara
- lógica de roles distribuida en varios archivos sin control central
- URLs externas aceptadas sin validación fuerte
- embeds con estilos inconsistentes
- config mezclada entre raíz y `data/` sin resolución clara
- acumulación acelerada de intereses en préstamos por reinicio de procesos
- comandos que solo funcionan en slash olvidando soporte para prefijo `&`

## Estándar de calidad

### Antes de cambiar un sistema crítico

- revisar si existe un servicio central
- confirmar si ya hay un flujo de validación
- añadir test antes o en el mismo cambio
- comprobar impacto en economía / niveles / roles / notificaciones / comandos prefix y slash

### Después de cambiar

- ejecutar pruebas relevantes
- verificar que no se producen mensajes duplicados
- validar integridad de archivos JSON
- revisar errores del terminal
- comprobar paridad entre Slash y Prefix

## Comandos de validación recomendados

- `node --check index.js`
- `node --test src/utils/__tests__/*.test.js`
- `node --test src/services/**/__tests__/*.test.js`
- `pnpm audit`

## Aportación de diseño

Cuando se trabaje en mejoras, priorizar:

1. estabilidad
2. seguridad
3. experiencia del usuario
4. mantenibilidad
5. estética visual

## Conclusión

Este proyecto necesita robustez más que crecimiento indiscriminado. La prioridad es fijar patrones sólidos, no sumar complejidad sin control.
