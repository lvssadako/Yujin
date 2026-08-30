# 🚀 GUÍA DE INICIO RÁPIDO (Developer Quickstart)

Guía práctica para levantar el bot, trabajar en desarrollo con Hot Reload, ejecutar la suite de pruebas y añadir nuevos módulos.

---

## 🛠️ 1. Requisitos y Configuración Inicial

### 1.1 Clonar e Instalar Dependencias
```bash
git clone <URL_DEL_REPOSITORIO>
cd LCOBOT
npm install
```

### 1.2 Configurar `.env`
Copia o crea el archivo `.env` en la raíz del proyecto:
```env
TOKEN=tu_token_de_discord_bot
CLIENT_ID=tu_application_client_id
GUILD_ID=tu_server_guild_id
DISABLE_HOT_RELOAD=false
```

---

## ⚡ 2. Ejecutar el Bot

### Modo Desarrollo (con Hot Reload y watch en troncales)
```bash
npm run dev
```
> **¿Cómo funciona el Hot Reload?**
> Al editar comandos en `src/commands/`, `src/services/`, `src/utils/`, etc., el bot recarga los módulos en memoria automáticamente **sin reiniciar el proceso ni perder la conexión al Gateway de Discord**.

### Modo Producción
```bash
npm start
```

---

## 🧪 3. Ejecutar Pruebas Automatizadas

```bash
# Correr toda la suite de pruebas (39 tests)
npm test

# Correr una suite específica
node --test src/utils/__tests__/streak.test.js
node --test src/utils/__tests__/command-loader.test.js
```

---

## 🏗️ 4. Guía de Desarrollo: Crear Nuevos Comandos

### Crear un nuevo Slash Command
1. Crea tu archivo en la categoría correspondiente dentro de `src/commands/<categoria>/<nombre>.js`:
```javascript
const { SlashCommandBuilder } = require('discord.js');
const { createSuccessEmbed, createErrorEmbed } = require('../../utils/embedFactory');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ejemplo')
    .setDescription('Comando de ejemplo'),
  
  async execute(interaction) {
    try {
      const embed = createSuccessEmbed({
        title: '¡Operación Exitosa!',
        description: 'El comando se ejecutó correctamente.'
      });
      return interaction.reply({ embeds: [embed] });
    } catch (err) {
      logger.error('Error en /ejemplo', { error: err.message, stack: err.stack });
      const errorEmbed = createErrorEmbed({
        title: 'Error',
        description: 'Ocurrió un error inesperado.'
      });
      return interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
};
```
2. Guarda el archivo: el **Hot Reload** lo cargará automáticamente en tiempo real.

---

## 🛡️ 5. Reglas de Oro de Arquitectura (`AGENTS.md`)

1. **Nunca escribir directamente en JSON**: Toda mutación de estado debe usar los servicios de `src/services/` o utilitarios atómicos (`src/utils/jsonStore.js`).
2. **Idempotencia en Recompensas**: Usa `grantOnce` (`src/utils/eventGuard.js`) para evitar dobles cobros o dobles premios.
3. **Validación de Jerarquías**: Antes de asignar o remover roles, verifica permisos con `canBotManageRole` (`src/utils/roleValidation.js`).
4. **Validación de URLs Externas**: Siempre normaliza y valida URLs de usuarios con `normalizeExternalImageUrl` (`src/utils/urlSafety.js`).
5. **Estilo Visual Consistente**: Emplea `src/utils/embedFactory.js` para generar embeds.

---

## 📋 6. Comandos Administrativos del Bot

- `/reload` (o `&reload`): Fuerza la recarga en caliente de comandos y servicios en memoria (con opción `sync_discord: true` para sincronizar con la API de Discord).
- `/restart` (o `&restart`): Reinicia el proceso del bot de manera segura.

