# CHECKLIST DE IMPLEMENTACIÓN VISUAL

## 🎯 FASE 0: Preparación (Día 1)

```
┌─────────────────────────────────────────────────────────┐
│ SETUP INICIAL - Sin romper código existente            │
└─────────────────────────────────────────────────────────┘

☐ Crear rama: git checkout -b refactor/structure
☐ Crear carpeta: mkdir -p src/{commands,events,services,utils,database,loaders,middleware,constants}
☐ Crear logs: mkdir -p logs
☐ Instalar Winston: pnpm add winston
☐ Instalar Zod: pnpm add zod
☐ Crear .env.example si no existe
☐ Documentar cambios en REFACTORING.md

Status: ⏳ Pendiente
Estimated Time: 30 minutos
Risk: 🟢 Bajo
```

---

## 📝 FASE 1: Logger Centralizado (Día 1-2)

```
┌─────────────────────────────────────────────────────────┐
│ LOGGER WINSTON - Reemplazar todos los console.log()   │
└─────────────────────────────────────────────────────────┘

☐ Crear: src/utils/logger/index.js
  ├─ Exportar logger singleton
  ├─ Configurar transports (file + console)
  ├─ Configurar niveles (debug, info, warn, error)
  └─ Configurar rotación de logs

☐ Crear: src/utils/logger/__tests__/logger.test.js
  ├─ Test que escribe en archivo
  ├─ Test que escribe en console (dev)
  ├─ Test de niveles de log
  └─ Test de rotación

☐ Actualizar eventos principales:
  ├─ events/guildMemberUpdate_boostTracker.js
  │  └─ Reemplazar console.log/warn con logger
  ├─ events/presenceStatusRoles.js
  │  └─ Reemplazar console.warn
  ├─ events/messageCreate_levels.js
  │  └─ Reemplazar console.log
  └─ events/voiceStateUpdate_levels.js
     └─ Reemplazar console.log/warn

☐ Actualizar utils principales:
  ├─ utils/*.js (todos)
  └─ Reemplazar console.log/warn

☐ Actualizar comandos:
  ├─ commands/**/*.js (todos)
  └─ Reemplazar console.log/warn

☐ Pruebas:
  ├─ Verificar logs/combined.log se genera
  ├─ Verificar logs/error.log para errores
  ├─ Verificar formato en console
  └─ Verificar que bot funciona

Status: ⏳ Pendiente
Estimated Time: 4-6 horas
Risk: 🟢 Bajo (cambio cosmético)
PR Checklist:
  ☐ Todos los tests pasan
  ☐ Logs en archivo funcionan
  ☐ Sin console.log/warn restantes en eventos
```

---

## 📦 FASE 2: Config Schema Validation (Día 2-3)

```
┌─────────────────────────────────────────────────────────┐
│ ZOD CONFIG SCHEMA - Validar config.json en startup   │
└─────────────────────────────────────────────────────────┘

☐ Crear: src/utils/config/schema.js
  ├─ Definir ConfigSchema con Zod
  ├─ Incluir todas las propiedades esperadas
  ├─ Validar tipos (string, number, array, object)
  └─ Validar regex (IDs son números)

☐ Crear: src/utils/config/loader.js
  ├─ loadAndValidateConfig(path)
  │  └─ Lee JSON
  │  └─ Valida con schema
  │  └─ Retorna config validado o error
  └─ Log de errores con contexto

☐ Crear: src/utils/config/__tests__/schema.test.js
  ├─ Test: config válido pasa
  ├─ Test: config inválido falla
  ├─ Test: IDs deben ser números
  ├─ Test: Campos opcionales funcionan
  └─ Test: Mensajes de error claros

☐ Crear: config/default.json
  ├─ Valores por defecto para todas las propiedades
  └─ Comentarios explicativos

☐ Actualizar: index.js
  ├─ Usar loadAndValidateConfig en lugar de readConfig
  ├─ Fail fast si config es inválida
  └─ Log en startup

☐ Actualizar: utils/configCache.js
  ├─ Usar nuevo loader
  └─ Mantener compatibilidad

☐ Pruebas:
  ├─ Startup con config válido ✓
  ├─ Startup rechaza config inválido ✗
  ├─ Mensajes de error son claros
  └─ Valores por defecto funcionan

Status: ⏳ Pendiente
Estimated Time: 3-4 horas
Risk: 🟠 Medio (puede romper si config es inválido)
Mitigation: Mantener config viejo hasta que pasen todos tests
```

---

## 📂 FASE 3: Reorganizar /commands (Día 3-5)

```
┌─────────────────────────────────────────────────────────┐
│ STRUCTURE COMMANDS - Agrupar por dominio               │
└─────────────────────────────────────────────────────────┘

☐ Crear estructura: src/commands/
  ├─ admin/
  │  ├─ ban.js         (mover: commands/ban.js)
  │  ├─ kick.js        (mover: commands/kick.js)
  │  └─ __tests__/
  ├─ economy/
  │  ├─ balance.js
  │  ├─ transfer.js
  │  ├─ shop.js
  │  ├─ chest.js
  │  └─ __tests__/
  ├─ level/
  │  ├─ level.js
  │  ├─ leveladmin.js
  │  ├─ leveladdchannel.js
  │  ├─ levellistchannels.js
  │  ├─ levelremovechannel.js
  │  ├─ levelrewards.js
  │  ├─ leaderboard.js
  │  └─ __tests__/
  ├─ profile/
  │  ├─ profile.js
  │  ├─ profileset.js
  │  ├─ badge.js
  │  └─ __tests__/
  ├─ game/
  │  ├─ blackjack.js
  │  ├─ slots.js
  │  ├─ coinflip.js
  │  ├─ crash.js
  │  ├─ reactduel.js
  │  ├─ carrera.js
  │  ├─ ruleta.js
  │  └─ __tests__/
  ├─ boost/
  │  ├─ boostxp.js
  │  ├─ boosters.js
  │  └─ __tests__/
  ├─ streak/
  │  ├─ streak.js
  │  ├─ streaks.js
  │  └─ __tests__/
  ├─ config/
  │  ├─ menuconfig.js
  │  ├─ setchannel.js
  │  ├─ setbumpreminder.js
  │  ├─ setboostchannel.js
  │  └─ __tests__/
  ├─ debug/
  │  ├─ testboost.js
  │  ├─ testsecurity.js
  │  ├─ testbutton.js
  │  └─ __tests__/
  ├─ utility/
  │  ├─ help.js
  │  ├─ bumpreminderinfo.js
  │  └─ __tests__/
  ├─ manage.js            (archivo especial)
  ├─ base/
  │  └─ Command.js        (nueva: base class)
  └─ commandLoader.js     (nueva: loader)

☐ Crear: src/commands/base/Command.js
  ├─ class Command { }
  ├─ constructor(name, description, options)
  ├─ canExecute(interaction)
  ├─ execute(interaction) - abstract
  └─ executeWithErrorHandling(interaction)

☐ Mover archivos:
  ├─ commands/ban.js → src/commands/admin/ban.js
  ├─ commands/kick.js → src/commands/admin/kick.js
  ├─ ... (todos los comandos)
  └─ Validar que requires siguen correctos

☐ Actualizar paths en cada comando:
  ├─ require('../utils/...') → require('../../../utils/...')
  ├─ require('../utils/economy') → require('../../../services/economy/...')
  └─ Usar relative paths correctos

☐ Crear: src/loaders/commandLoader.js
  ├─ loadCommands(path)
  │  └─ Lee recursivamente
  │  └─ Carga por categoría
  │  └─ Log errors pero continúa
  ├─ Retorna: { commands: Map, categories: Object }
  └─ Tests

☐ Actualizar: src/index.js
  ├─ const { loadCommands } = require('./loaders/commandLoader')
  ├─ const { commands, categories } = await loadCommands(...)
  ├─ client.commands = commands
  ├─ client.categories = categories
  └─ Mantener registration igual

☐ Pruebas:
  ├─ npm start - bot inicia correctamente
  ├─ Todos los comandos cargan
  ├─ /help muestra todos los comandos
  ├─ Comandos responden correctamente
  └─ No hay errores de require

Status: ⏳ Pendiente
Estimated Time: 8-10 horas
Risk: 🟠 Medio (muchos cambios de path)
Checklist:
  ☐ Todos los paths actualizados
  ☐ No hay require() rotos
  ☐ Bot inicia sin errores
  ☐ Todos los comandos funcionan
  ☐ Tests de integración pasan
```

---

## 🔧 FASE 4: Command Base Class & Services (Día 5-7)

```
┌─────────────────────────────────────────────────────────┐
│ SERVICES & BASE CLASS - Código reutilizable           │
└─────────────────────────────────────────────────────────┘

☐ Crear: src/utils/errors/
  ├─ AppError.js
  ├─ ValidationError.js
  ├─ PermissionError.js
  └─ NotFoundError.js

☐ Migrar utils/ → services/
  ├─ badgeManager.js → services/badge/manager.js
  ├─ badgeRoller.js → services/badge/roller.js
  ├─ badgeShop.js → services/badge/shop.js
  ├─ dailyMissions.js → services/daily/missions.js
  └─ ... (otros utils)

☐ Crear: src/services/
  ├─ badge/manager.js
  ├─ badge/roller.js
  ├─ badge/shop.js
  ├─ badge/__tests__/
  ├─ economy/transaction.js
  ├─ economy/validation.js
  ├─ economy/__tests__/
  ├─ level/calculator.js
  ├─ level/rewards.js
  ├─ level/__tests__/
  ├─ daily/missions.js
  └─ daily/__tests__/

☐ Actualizar comandos para usar Services:
  ├─ const BadgeService = require('../services/badge')
  ├─ const economyService = require('../services/economy')
  └─ Delegar lógica a services

☐ Crear tests para cada servicio:
  ├─ services/badge/__tests__/manager.test.js
  ├─ services/economy/__tests__/transaction.test.js
  └─ ... (para cada servicio)

☐ Pruebas de integración:
  ├─ Servicios funcionan independientemente
  ├─ Comandos usan servicios correctamente
  ├─ Tests de servicio pasan
  └─ Tests de comando pasan

Status: ⏳ Pendiente
Estimated Time: 10-12 horas
Risk: 🟠 Medio (refactoring extenso)
```

---

## ✅ FASE 5: Testing & Validation (Día 8-10)

```
┌─────────────────────────────────────────────────────────┐
│ TESTING - Validar que todo funciona                   │
└─────────────────────────────────────────────────────────┘

☐ Pruebas unitarias:
  ├─ src/utils/logger/__tests__/*.test.js (✓ DONE)
  ├─ src/utils/config/__tests__/*.test.js (NEW)
  ├─ src/services/**/__tests__/*.test.js (NEW)
  └─ Correr: npm test

☐ Pruebas de integración:
  ├─ Bot inicia correctamente
  ├─ Todos los comandos cargan
  ├─ Todos los eventos se registran
  ├─ Slash commands funcionan
  └─ Prefix commands funcionan (si existe)

☐ Pruebas funcionales (manual):
  ├─ /help - lista todos comandos
  ├─ /level - obtiene nivel
  ├─ /balance - obtiene balance
  ├─ Evento boost - se ejecuta correctamente
  ├─ Evento level-up - se ejecuta correctamente
  └─ Logs se escriben correctamente

☐ Performance checks:
  ├─ Startup time < 5s
  ├─ Command response time < 3s
  ├─ Memory usage < 200MB
  ├─ No memory leaks
  └─ No console errors

Status: ⏳ Pendiente
Estimated Time: 4-6 horas
Risk: 🟢 Bajo
Success Criteria:
  ☐ 0 console errors/warnings
  ☐ Todos los tests pasan
  ☐ Bot funciona igual que antes
  ☐ Performance es igual o mejor
```

---

## 📊 RESUMEN DE PROGRESO

```
FASE 0: Preparación      [████████░░░░░░░░░░] 50%
FASE 1: Logger           [░░░░░░░░░░░░░░░░░░] 0%
FASE 2: Config Schema    [░░░░░░░░░░░░░░░░░░] 0%
FASE 3: Reorganizar      [░░░░░░░░░░░░░░░░░░] 0%
FASE 4: Services         [░░░░░░░░░░░░░░░░░░] 0%
FASE 5: Testing          [░░░░░░░░░░░░░░░░░░] 0%

TOTAL:                   [████░░░░░░░░░░░░░░] 8%

Timeline: 10 días (80 horas)
Branch: refactor/structure
Status: 🟡 En progreso
```

---

## 🚀 NEXT STEPS

1. **Crear rama:** `git checkout -b refactor/structure`
2. **Iniciar Fase 0:** Carpetas + instalación
3. **Iniciar Fase 1:** Logger Winston
4. **Seguir fases secuencialmente**
5. **Mergear cuando todas las fases estén completas**

---

## 📱 Dashboard de Estado

```
┌─────────────────────────────────────────────────────────┐
│ REFACTORING STATUS BOARD                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Rama: refactor/structure                               │
│ Status: 🟡 En Progreso                                │
│                                                         │
│ COMPLETADO:                          PENDIENTE:        │
│   □ Fase 0: Setup                     ✓ Fase 1: Logger│
│   □ Fase 1: Logger                    ✓ Fase 2: Config│
│   □ Fase 2: Config Schema             ✓ Fase 3: Cmd   │
│   □ Fase 3: Reorganizar               ✓ Fase 4: Svc   │
│   □ Fase 4: Services                  ✓ Fase 5: Tests │
│   □ Fase 5: Testing                                    │
│                                                         │
│ BUGS ENCONTRADOS: 0                                    │
│ TESTS PASANDO: 24/24 ✓                                │
│ BREAKING CHANGES: 0                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

Este checklist es tu guía paso a paso. Marca cada ☐ cuando completes.
¿Comenzamos por Fase 0?
