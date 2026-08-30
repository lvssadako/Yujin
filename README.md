# Yujin Bot (LCO)

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
- Zod para validación de configuraciones
- Winston para sistema de logs
- Sistema de archivos local para persistencia (JSON)

## Estructura principal

- `src/index.js`: Arranque principal
- `src/commands/`: Comandos slash (divididos por dominio)
- `src/prefixCommands/`: Comandos por prefijo
- `src/events/`: Handlers de eventos
- `src/services/`: Lógica de negocio centralizada (economía, niveles, etc.)
- `src/utils/`: Validaciones, seguridad y generadores de utilidades (embeds, urls)
- `data/`: Almacenamiento local de estado del bot (JSON)
- `src/**/__tests__/`: Pruebas automatizadas colocalizadas

## Estado Actual y Mejoras Implementadas (Agosto 2026)

Tras una refactorización masiva, el bot ha alcanzado un estado de **alta estabilidad y seguridad**:

- **Arquitectura Limpia**: Todo el código fuente fue movido a `src/`, separando claramente `commands/`, `events/`, `services/`, `utils/`, y `data/`.
- **Persistencia Segura**: Implementación de guardado atómico de JSON (`writeJsonAtomic`) que previene la corrupción de datos.
- **Servicios Centralizados**: La lógica de Economía y Niveles ahora fluye a través de servicios controlados (`src/services/economy/` y `src/services/level/`), evitando escrituras directas.
- **Seguridad en Moderación**: Parches en comandos administrativos (`ban`, `kick`, `transfer`) para prevenir escalada de privilegios y bypass usando el rol del bot.
- **Testing Exhaustivo**: El proyecto cuenta con una suite de pruebas con 32 tests automatizados (`node --test`) que validan la creación de perfiles, esquemas de configuración, validación de roles y flujos de economía. Todos pasando 100%.

## Comandos Principales

El proyecto integra varios módulos de negocio que se mantienen bajo un estricto estándar:

- **Perfil y Personalización**: Generación de perfiles en Canvas, insignias (badges).
- **Niveles y Roles**: Experiencia por actividad, recompensas de roles configurables.
- **Tienda e Incentivos**: Compra de insignias, cofres misteriosos, recompensas diarias.
- **Economía y Monedas**: Transferencias, juegos (blackjack, ruleta, tragamonedas).
- **Eventos y Notificaciones**: Trackers de boosts del servidor, recordatorios de bump, roles por actividad.

## Siguientes Pasos (Propuestas de Evolución)

Con la base estructural sólida, los próximos pasos viables apuntan a expandir las funcionalidades del bot para la comunidad:

1. **Moderación Avanzada**:
   - Comandos de `timeout` (aislar usuarios temporalmente) y `unban`.
   - Comando `purge` / `clear` para limpieza masiva de mensajes.
   - Sistema de advertencias (`warn`) con persistencia.
2. **Soporte / Tickets**:
   - Integrar un sistema de tickets mediante botones y categorías privadas para moderación.
3. **Mejoras en Economía**:
   - Tabla de clasificación global (Leaderboard) para economía.
   - Roles o items comprables temporales (VIP).
4. **Localización e Internacionalización (i18n)**:
   - Extraer textos hardcodeados para facilitar futuras traducciones o cambios de personalidad del bot.
