# IMPLEMENTACIÓN PRÁCTICA - Ejemplos Concretos

## 1️⃣ LOGGER CENTRALIZADO (Winston)

### Instalación
```bash
pnpm add winston
```

### Implementación
```javascript
// src/utils/logger/index.js
const winston = require('winston');
const path = require('path');
const fs = require('fs');

const logDir = path.join(__dirname, '../../..', 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'lcobot' },
  transports: [
    // Errores en archivo
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    // Todo en archivo
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10485760,
      maxFiles: 10
    }),
    // Console en desarrollo
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
          })
        )
      })
    ] : [])
  ]
});

module.exports = logger;
```

### Uso en el código
```javascript
// Antes (actual)
console.log(`🚀 ${newMember.user.tag} comenzó a boostear ${guild.name}`);
console.warn('[presenceStatusRoles]', e?.message);
console.error('leveladmin error:', err);

// Después (con logger)
const logger = require('./utils/logger');

logger.info('Boost started', { 
  userId: newMember.id, 
  username: newMember.user.tag,
  guildId: guild.id,
  action: 'boost_added'
});

logger.warn('Failed to add presence role', { 
  userId: member.id,
  roleId: t.roleId,
  error: e?.message,
  context: 'presenceStatusRoles'
});

logger.error('Level admin error', { 
  subcommand: sub,
  userId: interaction.user.id,
  stack: err.stack
});
```

---

## 2️⃣ CONFIG SCHEMA VALIDATION (Zod)

### Instalación
```bash
pnpm add zod
```

### Implementación
```javascript
// src/utils/config/schema.js
const { z } = require('zod');

const ConfigSchema = z.object({
  // Bot Config
  token: z.string().min(1),
  clientId: z.string().regex(/^\d+$/),
  guildId: z.string().regex(/^\d+$/),

  // Channels
  boostChannelId: z.string().regex(/^\d+$/).optional(),
  boostAddedChannelId: z.string().regex(/^\d+$/).optional(),
  boostRemovedChannelId: z.string().regex(/^\d+$/).optional(),
  levelUpChannelId: z.string().regex(/^\d+$/).optional(),
  logChannelId: z.string().regex(/^\d+$/).optional(),
  mfaChannelId: z.string().regex(/^\d+$/).optional(),
  alertChannelId: z.string().regex(/^\d+$/).optional(),

  // Roles
  statusRoleTriggers: z.array(z.object({
    field: z.enum(['status']),
    includes: z.string(),
    roleId: z.string().regex(/^\d+$/)
  })).optional(),

  // Level System
  levelRewards: z.record(
    z.string().regex(/^\d+$/),  // Level
    z.string().regex(/^\d+$/)   // Role ID
  ).optional(),
  roleXpBonuses: z.record(
    z.string().regex(/^\d+$/),  // Role ID
    z.number().min(0).max(10)   // Multiplier
  ).optional(),

  // Shop
  shopBundles: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().min(0),
    items: z.record(z.string(), z.number())
  })).optional(),

  // Timezone
  timezone: z.number().min(-12).max(12).optional(),

  // ProfileCard
  profileCard: z.object({
    dpi: z.number().default(1),
    emojiSize: z.number().default(256),
    badgeSize: z.number().default(60),
    smoothing: z.enum(['low', 'medium', 'high']).default('high')
  }).optional()
}).strict();

module.exports = ConfigSchema;
```

### Uso
```javascript
// src/utils/config/loader.js
const ConfigSchema = require('./schema');
const logger = require('../logger');

function loadAndValidateConfig(configPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const validated = ConfigSchema.parse(raw);
    logger.info('Config validated successfully', { path: configPath });
    return validated;
  } catch (error) {
    if (error.name === 'ZodError') {
      logger.error('Config validation failed', { 
        issues: error.issues,
        path: configPath
      });
      throw new Error(`Invalid config: ${JSON.stringify(error.issues)}`);
    }
    throw error;
  }
}

module.exports = { loadAndValidateConfig };
```

---

## 3️⃣ COMMAND BASE CLASS

### Implementación
```javascript
// src/commands/base/Command.js
const { SlashCommandBuilder } = require('discord.js');
const { ValidationError, PermissionError } = require('../../utils/errors');
const logger = require('../../utils/logger');

class Command {
  /**
   * @param {string} name - Nombre del comando
   * @param {string} description - Descripción
   * @param {Object} options - Opciones
   */
  constructor(name, description, options = {}) {
    this.name = name;
    this.description = description;
    this.permissions = options.permissions || [];
    this.ownerOnly = options.ownerOnly || false;
    this.guildOnly = options.guildOnly || true;

    this.data = new SlashCommandBuilder()
      .setName(name)
      .setDescription(description);
  }

  /**
   * Valida si el usuario puede ejecutar este comando
   */
  async canExecute(interaction) {
    // Owner only
    if (this.ownerOnly && interaction.user.id !== process.env.OWNER_ID) {
      throw new PermissionError('Solo el owner puede usar este comando');
    }

    // Guild only
    if (this.guildOnly && !interaction.guild) {
      throw new PermissionError('Este comando solo funciona en servidores');
    }

    // Permisos requeridos
    if (this.permissions.length > 0) {
      const memberPerms = interaction.member?.permissions;
      if (!memberPerms) throw new PermissionError('No se pudo verificar permisos');

      const hasPerms = this.permissions.every(perm => memberPerms.has(perm));
      if (!hasPerms) {
        throw new PermissionError(
          `Necesitas: ${this.permissions.join(', ')}`
        );
      }
    }

    return true;
  }

  /**
   * Método a implementar por subclases
   */
  async execute(interaction) {
    throw new Error('execute() not implemented');
  }

  /**
   * Wrapper que maneja errores automáticamente
   */
  async executeWithErrorHandling(interaction) {
    try {
      await interaction.deferReply({ flags: 64 }); // Ephemeral

      // Validar permisos
      await this.canExecute(interaction);

      // Ejecutar
      await this.execute(interaction);

      logger.info('Command executed', {
        command: this.name,
        userId: interaction.user.id,
        status: 'success'
      });
    } catch (error) {
      logger.error('Command execution failed', {
        command: this.name,
        userId: interaction.user.id,
        error: error.message,
        stack: error.stack
      });

      const message = error instanceof PermissionError || error instanceof ValidationError
        ? error.message
        : 'Error al ejecutar comando';

      return interaction.editReply({
        content: `❌ ${message}`,
        flags: 64
      });
    }
  }
}

module.exports = Command;
```

### Ejemplo de uso
```javascript
// src/commands/admin/ban.js
const Command = require('../base/Command');
const { PermissionFlagsBits } = require('discord.js');

class BanCommand extends Command {
  constructor() {
    super('ban', 'Ban a member', {
      permissions: [PermissionFlagsBits.BanMembers]
    });

    this.data
      .addUserOption(o => o
        .setName('member')
        .setDescription('Member to ban')
        .setRequired(true))
      .addStringOption(o => o
        .setName('reason')
        .setDescription('Ban reason')
        .setRequired(false));
  }

  async execute(interaction) {
    const member = interaction.options.getUser('member');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    await interaction.guild.members.ban(member.id, { reason });

    return interaction.editReply({
      content: `✅ ${member.username} has been banned`
    });
  }
}

module.exports = new BanCommand();
```

---

## 4️⃣ SERVICE LAYER (Economy)

### Implementación
```javascript
// src/services/economy/TransactionService.js
const logger = require('../../utils/logger');
const { ValidationError } = require('../../utils/errors');

class TransactionService {
  constructor(economyRepository) {
    this.repo = economyRepository;
  }

  /**
   * Valida que se pueda hacer una transacción
   */
  async validate(fromId, amount) {
    if (amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    const user = await this.repo.findById(fromId);
    if (!user) {
      throw new ValidationError('User not found');
    }

    if (user.coins < amount) {
      throw new ValidationError('Insufficient funds');
    }

    return { valid: true, user };
  }

  /**
   * Transferencia atómica entre usuarios
   */
  async transfer(fromId, toId, amount, reason = '') {
    logger.info('Transfer initiated', { fromId, toId, amount, reason });

    await this.validate(fromId, amount);

    const tx = await this.repo.beginTransaction();
    try {
      // Restar de origen
      await this.repo.updateCoins(fromId, -amount, tx);
      logger.debug('Coins deducted', { fromId, amount });

      // Sumar a destino
      await this.repo.updateCoins(toId, amount, tx);
      logger.debug('Coins added', { toId, amount });

      // Guardar transacción
      await this.repo.logTransaction({
        from: fromId,
        to: toId,
        amount,
        reason,
        timestamp: Date.now()
      }, tx);

      await tx.commit();
      logger.info('Transfer completed successfully', { fromId, toId, amount });

      return { success: true, amount };
    } catch (error) {
      await tx.rollback();
      logger.error('Transfer failed and rolled back', { 
        fromId, toId, amount, error: error.message 
      });
      throw error;
    }
  }

  /**
   * Agregar monedas (recompensa)
   */
  async addCoins(userId, amount, reason = 'reward') {
    logger.info('Adding coins', { userId, amount, reason });
    
    await this.validate(userId, amount); // Valida que exista

    const result = await this.repo.updateCoins(userId, amount);
    
    logger.info('Coins added', { userId, amount, newTotal: result.coins });
    return result;
  }

  /**
   * Quitar monedas (castigo)
   */
  async removeCoins(userId, amount, reason = 'penalty') {
    logger.info('Removing coins', { userId, amount, reason });

    const validation = await this.validate(userId, amount);
    if (!validation.valid) throw new ValidationError('Cannot remove coins');

    const result = await this.repo.updateCoins(userId, -amount);
    
    logger.info('Coins removed', { userId, amount, newTotal: result.coins });
    return result;
  }
}

module.exports = TransactionService;
```

---

## 5️⃣ REPOSITORY PATTERN (Nivel + Económico)

### Implementación
```javascript
// src/database/repositories/economy.repo.js
const { readJsonSafe, writeJsonAtomic } = require('../../utils/store/json');
const path = require('path');

class EconomyRepository {
  constructor(dataPath = 'data/economy.json') {
    this.path = dataPath;
  }

  /**
   * Simula una transacción
   */
  async beginTransaction() {
    return {
      changes: [],
      commit: async () => {
        const data = readJsonSafe(this.path, {});
        // Aplicar cambios
        for (const change of this.changes) {
          const user = data[change.guildId]?.[change.userId] || {};
          user.coins = (user.coins || 0) + change.delta;
          if (!data[change.guildId]) data[change.guildId] = {};
          data[change.guildId][change.userId] = user;
        }
        await writeJsonAtomic(this.path, data);
      },
      rollback: async () => {
        this.changes = [];
      }
    };
  }

  /**
   * Buscar usuario por ID
   */
  async findById(guildId, userId) {
    const data = readJsonSafe(this.path, {});
    return data[guildId]?.[userId] || null;
  }

  /**
   * Actualizar monedas
   */
  async updateCoins(guildId, userId, delta) {
    const data = readJsonSafe(this.path, {});
    if (!data[guildId]) data[guildId] = {};
    
    const user = data[guildId][userId] || { coins: 0 };
    user.coins = Math.max(0, user.coins + delta);
    
    data[guildId][userId] = user;
    await writeJsonAtomic(this.path, data);
    
    return user;
  }

  /**
   * Obtener top 10 usuarios
   */
  async getLeaderboard(guildId, limit = 10) {
    const data = readJsonSafe(this.path, {});
    const users = Object.entries(data[guildId] || {})
      .map(([id, user]) => ({ id, ...user }))
      .sort((a, b) => b.coins - a.coins)
      .slice(0, limit);
    
    return users;
  }
}

module.exports = EconomyRepository;
```

---

## 6️⃣ VALIDATION MIDDLEWARE

### Implementación
```javascript
// src/middleware/validation.js
const { ValidationError } = require('../utils/errors');
const logger = require('../utils/logger');

/**
 * Middleware que valida el objeto de interacción
 */
function validateInteraction(interaction) {
  if (!interaction.user) throw new ValidationError('User not found');
  if (!interaction.guild) throw new ValidationError('Guild not found');
  if (!interaction.member) throw new ValidationError('Member not found');
  return true;
}

/**
 * Middleware que valida que el usuario esté en un canal de voz
 */
function validateVoiceChannel(interaction) {
  if (!interaction.member?.voice?.channel) {
    throw new ValidationError('Debes estar en un canal de voz');
  }
  return true;
}

/**
 * Middleware que valida cantidad (XP, monedas, etc)
 */
function validateAmount(amount, min = 0, max = Infinity) {
  return (value) => {
    const num = Number(value);
    if (isNaN(num)) throw new ValidationError('Amount must be a number');
    if (num < min) throw new ValidationError(`Amount must be at least ${min}`);
    if (num > max) throw new ValidationError(`Amount cannot exceed ${max}`);
    return num;
  };
}

/**
 * Middleware que registra la ejecución
 */
function logExecution(commandName) {
  return (interaction) => {
    logger.info('Command starting', {
      command: commandName,
      user: interaction.user.id,
      guild: interaction.guild?.id,
      timestamp: new Date().toISOString()
    });
  };
}

module.exports = {
  validateInteraction,
  validateVoiceChannel,
  validateAmount,
  logExecution
};
```

---

## 7️⃣ COMMAND LOADER (Nueva estructura)

### Implementación
```javascript
// src/loaders/commandLoader.js
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Carga todos los comandos de una carpeta
 */
async function loadCommands(commandsPath) {
  const commands = new Map();
  const categories = {};

  const loadCommandsRecursive = (dir) => {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      // Si es carpeta, recursivamente buscar comandos
      if (stat.isDirectory() && !file.startsWith('.')) {
        const category = file;
        categories[category] = [];
        
        const categoryPath = filePath;
        const categoryFiles = fs.readdirSync(categoryPath)
          .filter(f => f.endsWith('.js') && !f.startsWith('__'));

        for (const cmdFile of categoryFiles) {
          try {
            const cmd = require(path.join(categoryPath, cmdFile));
            
            if (!cmd.data?.name || !cmd.execute) {
              logger.warn(`Skipping invalid command: ${cmdFile}`);
              continue;
            }

            commands.set(cmd.data.name, cmd);
            categories[category].push(cmd.data.name);
            
            logger.debug(`Loaded command: ${cmd.data.name} (${category})`);
          } catch (error) {
            logger.error(`Failed to load command: ${cmdFile}`, { error: error.message });
          }
        }
      }
    }
  };

  loadCommandsRecursive(commandsPath);

  logger.info('Commands loaded', {
    total: commands.size,
    categories: Object.keys(categories)
  });

  return { commands, categories };
}

module.exports = { loadCommands };
```

### Uso en index.js
```javascript
// src/index.js
const { loadCommands } = require('./loaders/commandLoader');
const { loadEvents } = require('./loaders/eventLoader');

async function bootstrap() {
  const client = new Client({ intents: [...] });

  // Cargar comandos
  const { commands, categories } = await loadCommands(
    path.join(__dirname, 'commands')
  );
  client.commands = commands;
  client.categories = categories;

  // Cargar eventos
  const events = await loadEvents(
    path.join(__dirname, 'events')
  );

  // Registrar slash commands
  const commandData = Array.from(commands.values())
    .map(cmd => cmd.data.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commandData }
  );

  // Login
  await client.login(TOKEN);
}

bootstrap().catch(console.error);
```

---

## 📋 RESUMEN RÁPIDO

| Mejora | Impacto | Esfuerzo | Priority |
|--------|--------|----------|----------|
| Logger Winston | 🟢 Alto | 2h | 1 |
| Config Schema (Zod) | 🟢 Alto | 3h | 2 |
| Command Base Class | 🟢 Medio | 4h | 3 |
| Service Layer | 🟢 Medio | 6h | 4 |
| Repository Pattern | 🟢 Medio | 5h | 5 |
| Reorganizar carpetas | 🟢 Alto | 8h | 6 |

**Total Estimated:** 28 horas (1 semana completa)

---

Estos son ejemplos prácticos listos para implementar. ¿Cuál te gustaría que profundizemos primero?
