# 🌌 LCO Bot (Yujin) - Discord Community & Economy Platform

Bot integral de Discord para gestión comunitaria avanzada, diseñado con arquitectura modular de alto rendimiento sobre **Discord.js v14**, **Canvas 2D**, **Zod** y **Winston**. Integra sistemas de rachas de actividad con tarjetas visuales en tiempo real, perfiles personalizables, economía virtual, niveles por experiencia, moderación robusta con auditoría y un motor de **Hot Reload en caliente**.

---

## 🚀 Características Principales

### 🔥 1. Sistema de Rachas de Actividad (Activity Streaks)
- **Seguimiento Diario**: Incremento automático de racha por actividad en mensajes con control de huso horario y cálculo preciso de medianoche.
- **6 Niveles de Fuego (Flame Tiers)**:
  - 🕯️ **Chispa Inicial** (1+ días): Inicio del fuego sin beneficios adicionales.
  - ⚡ **Llama Eléctrica** (3+ días): +5% XP pasivo, cash drop de 500 monedas.
  - 🔥 **Fuego Vivo** (7+ días): +10% XP pasivo, 10% descuento en tienda, insignia especial y 1,500 monedas.
  - 💎 **Llama Diamante** (14+ días): +15% XP pasivo, 15% descuento en tienda, insignia y 5,000 monedas.
  - 🌟 **Fuego Cósmico** (30+ días): +25% XP pasivo, 20% descuento en tienda, insignia y 15,000 monedas.
  - 👑 **Fénix Legendario** (60+ días): +35% XP pasivo, 25% descuento en tienda, insignia y 50,000 monedas.
- **Protección con Ítem Congelador (`congelador`)**: Consume automáticamente un congelador del inventario para preservar la racha si el usuario no chatea durante un día.
- **Recordatorios Inteligentes por DM (`/streak alertas`)**: Notificación automática 3 horas antes de la medianoche local para avisar que la racha está en riesgo.
- **Generador de Tarjetas Canvas 2D en Alta Definición**:
  - Avatar circular con borde de color temático dinámico.
  - Renderizado vectorial de iconos de fuego y estado de protección diario.
  - Barra de progreso de racha con porcentaje hacia el siguiente nivel.
  - Pastillas de beneficios activos (+% XP, % Descuento, Congeladores en inventario).
  - Firma dinámica en el pie de página con el nombre del bot.
- **Estudio Global de Personalización (`/streak customizar` o `/racha customizar`)**:
  - **Plantillas y Wallpapers Temáticos**:
    - 🔥 **Fuego Infernal** (`inferno`): Llamas y brasas ardientes en primer plano (`#FF4500`).
    - 👑 **Fénix Dorado** (`phoenix_gold`): Destellos ardientes dorados y aura resplandeciente (`#FFA502`).
    - 🖤 **Obsidiana Minimal** (`dark_obsidian`): Relieve y geometría 3D de obsidiana profunda (`#747D8C`).
    - ⚡ **Cyberpunk Neon** (`cyberpunk`): Resplandor cian futurista (`#00E5FF`).
    - 🌌 **Aurora Boreal** (`aurora`): Auroras boreales nocturnas (`#2ED573`).
    - 🔮 **Galaxia Cósmica** (`cosmic`): Nebulosa cósmica y polvo estelar (`#9B59B6`).
    - 🌸 **Sakura Flame** (`sakura_blaze`): Pétalos de cerezo suaves (`#FF78AE`).
    - ⬛ **Fondo Oscuro por Defecto** (`none`): Gradiente oscuro nativo optimizado.
  - **Wallpapers por URL Propia**: Desbloqueable para Boosters del Servidor, Nivel 5+ o Racha de 7+ días.
  - **Ajuste de Opacidad**: Selector interactivo de opacidad (30%, 50%, 65%, 80%, 100%).
  - **Colores de Acento Personalizados**: Código `#RRGGBB` o automático según el nivel/plantilla.
  - **Persistencia Global**: La configuración de la tarjeta se guarda globalmente y se refleja en todos los servidores donde opere el bot.

---

### 🎨 2. Estudio y Tarjetas de Perfil (`/profile` & `/profileset`)
- **Visualización en Canvas**: Perfil gráfico con avatar, nivel actual, rango, barra de XP, monedas, título personalizado, rol destacado e insignias equipadas.
- **Personalización Interactiva (`/profileset`)**:
  - Títulos y lemas personalizados de hasta 32 caracteres.
  - Paletas de color temáticas y colores hexadecimales personalizados.
  - Galería de wallpapers predefinidos o imágenes externas validadas.
  - Ajuste de opacidad de fondo para garantizar legibilidad.

---

### 🔄 3. Sistema de Hot Reload y Control de Reinicio
- **Recarga en Caliente en Memoria (Hot Reload)**:
  - Watcher en tiempo real que escucha cambios en `src/commands/`, `src/commands_shared/`, `src/prefixCommands/`, `src/services/`, `src/constants/` y `src/utils/`.
  - Purga la caché interna de `require` y recarga los módulos al instante **sin desconectar el bot de Discord ni reiniciar el proceso**.
  - Sincronización inteligente con la API de Discord (`syncSlashCommands`): Compara el hash SHA-256 de las definiciones de comandos y solo realiza llamadas REST si la estructura de comandos cambió, protegiendo contra rate limits.
- **Reinicio Controlado de Proceso (`npm run dev`)**:
  - Acotado estrictamente a los archivos troncales (`src/index.js`, `.env`, `package.json`, `config/default.json`, `src/events/`).
  - Los archivos de datos JSON (`data/`, `src/data/`), logs y documentación están excluidos de reinicios para evitar bucles.
- **Comandos de Mantenimiento para Administradores**:
  - `/reload` (o `&reload`): Recarga comandos, servicios y utilidades en caliente (con opción `sync_discord` para forzar sincronización con Discord).
  - `/restart` (o `&restart`): Reinicia el proceso del bot de manera segura y controlada con confirmación visual.

---

### 🛡️ 4. Seguridad, Moderación y Auditoría
- **Comandos Administrativos Seguros**:
  - `/ban` y `/unban`: Baneo y desbaneo seguro con registro de motivos.
  - `/kick`: Expulsión controlada con validación de jerarquías de roles.
  - `/timeout`: Aislamiento temporal con soporte para duraciones legibles (ej. `10m`, `1h`, `1d`).
  - `/warn`: Sistema de advertencias a miembros con persistencia y embeds detallados.
  - `/clear`: Purga masiva de mensajes (hasta 100 mensajes) con filtros de canal.
- **Sistemas de Seguridad Automática**:
  - **Automod** (`messageCreate_automod`): Detección y filtrado de contenido indebido.
  - **Auditoría de Mensajes** (`messageDelete_audit`, `messageUpdate_audit`): Registro de mensajes eliminados o editados en canales de auditoría.
- **Protección de Jerarquía de Roles**: Validación centralizada en `canBotManageRole` para impedir que se asignen roles superiores al del bot o roles administrados por integraciones externas.

---

### 💰 5. Economía, Casino y Recompensas
- **Monedas y Transacciones**: Consulta de balance (`/balance`, `/bal`), transferencias entre usuarios (`/pay`), ranking económico (`/leaderboard`).
- **Juegos de Casino**:
  - `/blackjack` (`&blackjack`): Juego interactivo de Blackjack con botones.
  - `/ruleta` (`&ruleta`): Apuestas clásicas por color o número.
  - `/slots` (`&slots`): Máquina tragamonedas con multiplicadores especiales.
  - `/coinflip` (`&coinflip`): Lanzamiento de moneda doble o nada.
  - `/crash` (`&crash`): Multiplicador ascendente en tiempo real.
- **Recompensas e Incentivos**:
  - `/daily`: Recompensa diaria con multiplicador de racha.
  - Misiones diarias (`daily_missions.json`) y cofres misteriosos (`chests.json`).
  - Tienda de insignias y boosts (`/shop`, `/badgeshop`).

---

## 📁 Estructura del Proyecto

```text
LCOBOT/
├── .env.example                # Plantilla de variables de entorno
├── config/
│   └── default.json            # Configuración base del bot y servidor
├── context/                    # Recursos visuales y referencias de contexto
├── data/                       # Almacenamiento persistente local (JSON)
├── docs/                       # Documentación técnica y reportes
├── logs/                       # Logs generados por Winston
├── src/
│   ├── index.js                # Punto de entrada principal y Gateway Discord
│   ├── commands/               # Comandos Slash agrupados por categoría
│   │   ├── admin/              # ban, kick, timeout, warn, clear, reload, restart, etc.
│   │   ├── config/             # leveladmin, ecoadmin, serverconfig
│   │   ├── economy/            # balance, pay, shop, leaderboard, daily
│   │   ├── games/              # blackjack, ruleta, slots, coinflip, crash
│   │   ├── profile/            # profile, profileset
│   │   └── utility/            # streak, racha, help, ping
│   ├── commands_shared/        # Comandos híbridos (Slash + Prefix)
│   ├── prefixCommands/         # Comandos legacy ejecutables con prefijo '&'
│   ├── constants/              # Colores, temas de perfil y plantillas de racha
│   ├── database/               # Conectores y gestores de base de datos
│   ├── events/                 # Eventos de Discord (mensajes, miembros, voz, auditoría)
│   ├── loaders/                # Loader de comandos y watcher de Hot Reload
│   ├── middleware/             # Validaciones previas a ejecución
│   ├── services/               # Lógica de negocio desacoplada
│   │   ├── audit/              # Servicios de auditoría
│   │   ├── automod/            # Servicios de moderación automática
│   │   ├── economy/            # Servicio central de economía y transacciones
│   │   ├── giveaways/          # Gestor de sorteos
│   │   ├── level/              # Servicio de niveles, XP y roles
│   │   ├── profile/            # Estudio y personalizador de perfiles
│   │   └── streak/             # Motor de rachas, generador Canvas y personalizador
│   ├── tools/                  # Herramientas de mantenimiento y backups automáticos
│   └── utils/                  # Utilidades comunes, seguridad URL, canvas y embeds
│       └── __tests__/          # Suite de pruebas automatizadas colocalizadas
└── package.json                # Dependencias, scripts y configuración de pruebas
```

---

## 🛠️ Instalación y Configuración

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone <URL_DEL_REPOSITORIO>
cd LCOBOT
npm install
```

### 2. Configurar variables de entorno
Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`:
```env
TOKEN=tu_token_de_discord_bot
CLIENT_ID=tu_application_client_id
GUILD_ID=tu_server_guild_id
DISABLE_HOT_RELOAD=false
```

### 3. Scripts Disponibles

- **Modo Desarrollo (con Hot Reload y reinicio estricto de troncales)**:
  ```bash
  npm run dev
  ```
- **Modo Producción**:
  ```bash
  npm start
  ```
- **Ejecución de Pruebas Automatizadas**:
  ```bash
  npm test
  ```

---

## 🧪 Pruebas Automatizadas

El proyecto utiliza el test runner nativo de Node.js (`node --test`), garantizando validaciones de:
- Carga y recarga en caliente de comandos y watchers (`commandLoader`).
- Filtro estricto de archivos para evitar reinicios por JSONs o temporales (`shouldTriggerHotReload`).
- Sincronización hash SHA-256 de comandos con Discord API (`syncSlashCommands`).
- Validación y normalización de URLs externas y seguridad contra SSRF (`urlSafety`).
- Renderizado de tarjetas Canvas en alta definición y manejo de niveles máximos (`streakCard`).
- Jerarquía de roles y asignación segura (`roleValidation`).
- Persistencia atómica de JSON y protección contra duplicidad de recompensas (`grantOnce`).
- Validación de esquemas con Zod (`schema.js`) y logging centralizado con Winston (`logger`).
- Middleware de Rate Limiting y Cooldowns con limpieza TTL (`rateLimit.js`).
- Capa de abstracción de base de datos y repositorios (`src/database/`).
- Sistema balanceado de niveles de texto y voz con tops global, semanal y diario (`src/services/level/`).

Ejecución de la suite completa:
```bash
npm test
# o directamente:
node --test "src/**/__tests__/*.test.js"
```
*Resultado: 47 pruebas pasando al 100%.*

---

## 📜 Reglas de Arquitectura y Buenas Prácticas

1. **Persistencia Centralizada**: Nunca escribir directamente en archivos JSON dentro de `data/` o `src/data/` desde comandos o eventos sueltos; toda mutación debe canalizarse por sus respectivos servicios (`economyService`, `levelService`, `profileStore`).
2. **Idempotencia de Recompensas**: Toda recompensa o evento repetitivo debe validarse mediante `grantOnce` o claves compuestas `guild:user:event` para evitar duplicaciones.
3. **Seguridad y Validación**: Validar tipos de datos, permisos de usuario y jerarquía del bot antes de guardar cambios o ejecutar acciones administrativas.
4. **Diseño Visual Consistente**: Todos los mensajes del bot deben utilizar las utilidades de `src/utils/embedFactory.js` para mantener coherencia estética.

---

## 👥 Contribución y Mantenimiento

Para realizar cambios en el proyecto:
1. Asegúrate de que los archivos de negocio residan en `src/services/` o `src/utils/`.
2. Verifica que las pruebas sigan pasando con `npm test`.
3. Comprueba la sintaxis de JavaScript antes de desplegar con `node --check src/index.js`.

---

## 🔒 Licencia y Términos de Uso

**Propietario y Confidencial (All Rights Reserved)**

Este proyecto es de **uso estrictamente privado y propietario**. Queda terminantemente prohibido su uso, copia, reproducción, modificación, distribución, sublicenciamiento o despliegue para cualquier fin (comercial o no comercial) sin la autorización previa y por escrito del autor.

Para más detalles, consulta el archivo [`LICENSE`](./LICENSE).


