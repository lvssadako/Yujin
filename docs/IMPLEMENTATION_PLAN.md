# Plan de implementación y refactor del proyecto

## 1. Objetivo general

Reestructurar el bot para que pase de ser una base funcional a una solución más robusta, segura y mantenible, con mejor experiencia del usuario, mejores mensajes visuales y menos riesgo de bugs por duplicación, corrupción de datos o eventos no controlados.

---

## 2. Diagnóstico inicial

### 2.1 Fortalezas detectadas

- Arquitectura modular por carpetas clara
- Separación entre comandos, eventos y utilidades
- Uso de Discord.js v14 moderno
- Soporte para slash commands y prefix commands
- Módulos de perfiles, niveles, economía y tienda ya implementados
- Existen tests básicos y se ha comprobado sintaxis del arranque principal

### 2.2 Riesgos principales detectados

#### Críticos

1. Persistencia basada en JSON sin validación/schema
   - Archivos como `levels.json`, `profile.json`, `economy.json`, `boosts.json` son puntos frágiles
   - Cualquier escritura parcial puede corromper el estado del bot

2. Recompensas duplicadas por eventos concurrentes
   - El patrón de `GuildMemberUpdate`, `messageCreate`, timers, y notificaciones pueden disparar varias recompensas indistintamente
   - Ejemplo: boost tracker y otros eventos pueden generar más de un premio o más de una notificación

3. Descarga de URLs externas sin validación fuerte
   - En `commands/profile.js` se aceptan URLs para fondos de perfil y se descargan
   - Riesgo de abuso, carga innecesaria o uso inseguro de contenido externo

4. Estado global no controlado
   - `global` y `setInterval` proliferan en la lógica del bot
   - Esto dificulta el control de reinicios y limpieza de timers

#### Medios

1. Configuración dividida entre `config.json` y `data/config.json`
   - Confusión del valor activo y riesgo de resolver configuraciones desalineadas

2. Lógica de roles dispersa y automática
   - Roles por presencia, top roles, reward roles y boosters se gestionan desde varios puntos
   - Riesgo de inconsistencias o asignaciones no esperadas

3. Nota de dependencias y validación insuficiente
   - Aunque no hay vulnerabilidades conocidas de npm, la arquitectura no valida inputs ni nombres de archivos ni tipos de datos

#### Bajos

1. Diseño visual inconsistente entre embeds
   - Diferentes estilos, tamaños, colores y formatos no homogéneos
2. Falta de plantillas y patrones reutilizables
3. Mensajes repetitivos o poco claros para usuario
4. Notificaciones de recompensa con disciplina visual débil

---

## 3. Principios de diseño para la nueva implementación

### 3.1 Principio 1: una sola fuente de verdad

Toda modificación de datos críticos debe pasar por una capa central:

- economy service
- profile service
- level service
- boost service
- config service

### 3.2 Principio 2: transacciones atómicas

Cada operación importante debe:

- cargar el estado actual
- validar estructura
- mutar en memoria
- serializar a tmp
- mover a destino final
- crear backup si corresponde

### 3.3 Principio 3: idempotencia

Las recompensas deben ser ejecutadas una sola vez por identidad de evento.

Ejemplo de clave:

- guildId:userId:eventType:source

### 3.4 Principio 4: validación antes de acción

Todo input externo debe validarse antes de:

- asignar role
- pagar dinero
- descargar imagen
- dar XP
- registrar config

### 3.5 Principio 5: un solo canal de anuncio por tipo

No debe existir ambigüedad en la salida de avisos de boost, bump, recompensa o sistema. La configuración debe tener un canal explícito por tipo con fallback controlado.

---

## 4. Fase 0: preparación y estabilización

### Objetivo

Poner una base segura antes de sumar más features.

### Tareas

- Crear un modelo de datos centralizado para `economy`, `levels`, `profiles`, `boosts`
- Definir validadores por tipo de dato
- Introducir utilidades `readJsonSafe`, `writeJsonAtomic`, `normalizeConfig`
- Establecer regla: ningún archivo JSON se escribe directamente fuera de `utils/`
- Añadir tests para:
  - economía
  - niveles
  - boost tracker
  - configuración
  - manejo de canales

### Resultado esperado

- Aumenta seguridad
- Se elimina gran parte de corrupción y pérdida de estado
- Se reduce drift entre módulos

---

## 5. Fase 1: refactor de persistencia

### Objetivo

Eliminar la dependencia de JSON libre como base de verdad para lógica crítica.

### Recomendaciones permanentes

#### 5.1 Escritura atómica

Todo `writeFileSync` de estado crítico debe hacerse con:

- archivo temporal
- serialización completa
- renombrado seguro
- backup de seguridad

#### 5.2 Validación de estructuras

Cada data model debe tener:

- whitelist de claves
- tipos esperados
- converts seguros
- defaults para campos vacíos

#### 5.3 Limitar crecimiento de archivos

- rotación mensual o semanal de backups
- compresión si crece mucho
- datos de larga vida en estructura normalizada

#### 5.4 Escrituras por servicio

Ejemplo:

- `utils/economyService.js`
- `utils/profileService.js`
- `utils/levelService.js`
- `utils/boostService.js`

### Criterio de éxito

- ningún comando entra en `fs` manual sin pasar por servicio
- no hay writes directos en archivos del bot fuera de utilidad central

---

## 6. Fase 2: seguridad y validación

### 6.1 Riesgos de seguridad a cubrir

#### Crítico: URLs externas para fondo de perfil

Solución:

- permitir solo dominios aprobados
- validar por protocolo HTTPS
- tamaño máximo de imagen
- mime type permitido
- timeout de descarga
- no aceptar imágenes arbitrarias con redirecciones

#### Crítico: recompensas duplicadas

Solución:

- sistema de event IDs
- `Map` con TTL para deduplicación
- validación de autor y origen del evento
- guardado de estado de transacción en memoria y persistencia

#### Medio: gestión de roles

Solución:

- validación de jerarquía del rol del bot
- no dar roles que estén por encima del bot
- filtros por permiso del servidor
- usar `PermissionsBitField` explícitos y verificaciones de permisos mínimos

#### Medio: config ambigua

Solución:

- crear `config.schema.json`
- centralizar carga con merges seguros
- no mezclar root config y data config sin documentación clara

---

## 7. Fase 3: experiencia de usuario y UX de mensajes

### 7.1 Objetivo

Que el bot parezca coherente, premium y profesional.

### Reglas clave

- mismo estilo para todos los embeds
- mismo color base por tipo de flujo
- mismo patrón de respuesta en interacciones
- mensajes cortos, claros y accionables
- no saturar con demasiados campos
- usar emojis con criterio, no de forma aleatoria

### Plantillas recomendadas

#### A. Éxito / recompensa

- color verde o dorado
- título corto
- descripción con beneficio directo
- resumen de recompensa
- CTA si procede

#### B. Error / validación

- color rojo oscuro
- explicación breve
- qué hacer ahora

#### C. Acciones de comunidad

- color azul / morado
- tono informativo
- texto claro, no saturado

### Recomendación UX

- usar `ephemeral` para mensajes de validación, no para mensajes importantes de comunidad
- si una acción es crítica, devolver confirmación visible y accionable
- usar botones con estilos limitados: primary / success / danger
- no mezclar demasiados componentes visuales en un solo mensaje

---

## 8. Fase 4: mejora de embeds

### Estándar visual recomendado

- `EmbedBuilder` con color semántico
- `title` preciso, no demasiado largo
- `description` de 1-3 líneas
- `fields` máximo 3 si hay mucha información
- `thumbnail` solo si aporta contexto
- `footer` con identidad del sistema, no ruido

### Paleta sugerida

- éxito: `0x2ecc71`
- error: `0xe74c3c`
- información: `0x3498db`
- premium / boost: `0xf47fff`
- dinero: `0xf1c40f`
- riesgo: `0xd35400`

### Mejora permanente

Crear un módulo `utils/embedFactory.js` con helpers:

- `successEmbed(title, description, fields?)`
- `errorEmbed(message)`
- `infoEmbed(title, body)`
- `rewardEmbed(rewardData)`
- `shopEmbed(list)`

Esto elimina el estilo inconsistente.

---

## 9. Fase 5: mejoras de experiencia del usuario

### Objetivos

- consistencia en mensajes
- feedback claro
- menos fricción para usuario final
- más ayuda visual

### Recomendaciones

- mensajes de error con solución inmediata
- siempre que se produzca un evento, indicar siguiente paso
- para compras y recompensas, mostrar resumen breve
- si un comando falla, explicar causa sin revelar datos internos
- mantener respuestas en idioma consistente (español)

### Ejemplos de mejora

- “Faltan fondos” => mostrar cuánto falta
- “Este comando solo funciona para boosters” => explicar qué es un booster y cómo conseguirlo
- “No hay rol configurado” => mostrar la acción recomendada

---

## 10. Fase 6: refactor de arquitectura y limpieza de riesgos

### 10.1 Módulos a revisar

- `events/messageCreate.js`
- `events/guildMemberUpdate_boostTracker.js`
- `utils/economy.js`
- `utils/levelStore.js`
- `utils/profileStore.js`
- `commands/shop.js`
- `commands/profile.js`
- `commands/toproles.js`

### 10.2 Qué mejorar

- unificar naming
- eliminar lógica duplicada
- centralizar conversiones
- asegurar que la misma compra/recompensa no se ejecute dos veces
- controlar `setInterval` con IDs y limpieza en cierre del bot

---

## 11. Fase 7: pruebas, validación y QA

### Test mínimo obligatorio

- economía: suma y resta de monedas/gems
- niveles: XP y subida de nivel
- boost: activación y recompensa
- roles: asignación y limpieza
- config: merge seguro y campos faltantes
- embeds: renderización sin errores
- eventos de interacción: botón y modal

### Herramientas

- Node test
- pruebas unitarias por módulo
- pruebas de integración para eventos

### Criterio de éxito

- no se rompe la lógica principal con cada cambio
- cambios críticos tienen cobertura de prueba
- bugs repetidos ya no vuelven a aparecer

---

## 12. Matriz de riesgos final

| Nivel | Riesgo | Impacto | Solución permanente |
|---|---|---:|---|
| Crítico | JSON no validado / corrupción | Alto | escritura atómica + schema + validadores |
| Crítico | recompensas duplicadas | Alto | deduplicación por evento + idempotencia |
| Crítico | URLs externas sin control | Alto | whitelist y validación de imagen |
| Crítico | estado global no controlado | Alto | mover lógica a servicios y limpiar timers |
| Medio | config ambigua | Medio | centralizar config con schema |
| Medio | roles automáticos inconsistentes | Medio | validación jerarquía y un único servicio |
| Medio | notificaciones duplicadas | Medio | deduplicación por canal + tipo + usuario |
| Bajo | embeds inconsistentes | Bajo | factory de embeds |
| Bajo | mensajes repetitivos | Bajo | plantillas + copy estándar |

---

## 13. Prioridades reales de desarrollo

### Prioridad 1: estabilidad

1. persistencia segura
2. deduplicación de eventos
3. validación de config
4. separación de servicios de negocio

### Prioridad 2: calidad UX

1. plantillas de embeds
2. mensajes más claros
3. mejor flujo de compra y obtención de recompensas
4. consistent naming y copy

### Prioridad 3: escalabilidad

1. servicios centralizados
2. observabilidad
3. testing por flujos clave
4. limpieza de timers y estado global

---

## 14. Propuesta de roadmap

### Sprint 1

- revisión y refactor de `utils/*` críticos
- centralización de writes
- deduplicación de boost y bump
- validación de config

### Sprint 2

- centralización de economy / levels / profiles
- estandarización de embeds
- limpieza de eventos repetitivos

### Sprint 3

- mejoras de UX y mensajes de feedback
- preflight validation para inputs externos
- tests de flujos críticos

### Sprint 4

- observabilidad y logs
- end-to-end QA
- preparación para despliegue profesional

---

## 15. Conclusión

El proyecto tiene una base funcional sólida, pero necesita pasar de “bot funcional” a “sistema robusto de producción”. La prioridad no es añadir más contenido, sino consolidar la lógica de negocio, reducir la duplicación, mejorar la seguridad y standardizar la experiencia del usuario para que el proyecto sea más estable y más fácil de mantener.
