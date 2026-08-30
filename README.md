# LCO Bot

Bot de Discord para gestión de comunidad con sistema de niveles, perfiles personalizados, tienda de boosts, misiones diarias, roles automáticos y recompensas por actividad.

## Visión general

Este proyecto centraliza una gran parte de la lógica del servidor en un bot único. Tiene un modelo basado en comandos slash, comandos de prefijo, eventos de Discord y almacenamiento local en archivos JSON. El bot gestiona:

- experiencia y niveles
- roles por nivel
- perfiles visuales de usuario
- boosts XP
- economy / monedas / gems
- cofres, insignias y tienda
- notificaciones automáticas de boost y bump
- reconocimiento de roles por presencia o actividad

## Tecnologías principales

- Node.js
- Discord.js v14
- Canvas para renderizado de perfiles
- dotenv para configuración por entorno
- Sistema de archivos local para persistencia (JSON)
- Módulos internos de utilidades para organización funcional

## Estructura principal

- `index.js`: arranque principal
- `commands/`: comandos slash
- `prefixCommands/`: comandos por prefijo
- `events/`: handlers de eventos
- `utils/`: persistencia, validación y utilidades compartidas
- `data/`: almacenamiento local de estado del bot
- `tests/`: pruebas automatizadas

## Estado actual

El proyecto ya tiene funcionalidades avanzadas y algunos tests básicos, pero requiere un refactor de estabilidad antes de seguir creciendo. Los principales riesgos detectados son:

- persistencia JSON sin validación/schema
- escrituras directas sin control de atomicidad
- riesgo de duplicación de recompensas por eventos múltiples
- notificaciones automáticas envíadas por canales incorrectos o repetidos
- lógica dispersa de economía, niveles y boosts

## Objetivo del proyecto

Transformar este bot de una implementación funcional en una base robusta, escalable y mantenible, con mejor experiencia de usuario, diseño visual consistente y una capa de seguridad y validación sólida.

## Comandos principales

El proyecto integra varios módulos de negocio que conviene mantener bajo un mismo estándar:

- perfil y personalización
- niveles y roles
- tienda e incentivos
- economía y monedas
- misiones diarias
- boosters y recompensas por actividad
- eventos de notificación / bump / boost / presencia

## Recomendación de base antes de nuevas features

Antes de añadir más funcionalidades, conviene estabilizar:

1. persistencia y validación
2. centralización de economía y XP
3. control de colaboraciones entre eventos
4. testing de flujos críticos
5. diseño visual y mensajes consistentes

## Siguientes pasos

Consulta la guía en `docs/IMPLEMENTATION_PLAN.md` para el plan detallado, la matriz de riesgos y la estrategia de mejora del bot.
