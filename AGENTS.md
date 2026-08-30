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

## Problemas ya detectados y que NO deben repetirse

- escritura directa a JSON en varios lugares sin validación
- recompensas duplicadas por eventos múltiples
- canales de notificación ambiguos o compartidos sin prioridad clara
- lógica de roles distribuida en varios archivos sin control central
- URLs externas aceptadas sin validación fuerte
- embeds con estilos inconsistentes
- config mezclada entre raíz y `data/` sin resolución clara

## Estándar de calidad

### Antes de cambiar un sistema crítico

- revisar si existe un servicio central
- confirmar si ya hay un flujo de validación
- añadir test antes o en el mismo cambio
- comprobar impacto en economía / niveles / roles / notificaciones

### Después de cambiar

- ejecutar pruebas relevantes
- verificar que no se producen mensajes duplicados
- validar integridad de archivos JSON
- revisar errores del terminal

## Comandos de validación recomendados

- `node --check index.js`
- `node --test tests/*.js`
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
