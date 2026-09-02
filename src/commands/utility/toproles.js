const logger = require('../../utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');
const cfgPath = path.join(__dirname, '..', '..', '..', 'config.json');

function readLevels() {
  try {
    const data = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));
    return data.guilds || data;
  } catch {
    return {};
  }
}

function readConfig() {
  try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; }
}

function saveConfig(cfg) {
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8');
}

/**
 * Actualiza roles de top cuando haya cambios en el ranking (OPTIMIZADO)
 */
async function updateTopRoles(guild) {
  try {
    const cfg = readConfig();
    if (!cfg.topRoles || typeof cfg.topRoles !== 'object') {
      logger.info('[TOP ROLES] ⚠️ No hay topRoles configurados');
      return;
    }

    const levels = readLevels();
    const guildLevels = levels[guild.id] || {};

    if (Object.keys(guildLevels).length === 0) {
      logger.info('[TOP ROLES] ⚠️ No hay datos de niveles para este servidor');
      return;
    }

    // Ordenar usuarios por NIVEL primero, luego XP como desempate
    const sortedUsers = Object.entries(guildLevels)
      .map(([id, data]) => ({ id, level: data.level || 0, xp: data.xp || 0 }))
      .sort((a, b) => {
        if (b.level !== a.level) return b.level - a.level; // Por nivel descendente
        return b.xp - a.xp; // Si nivel igual, por XP descendente
      });

    logger.info('[TOP ROLES] 📊 Top 5 usuarios:', sortedUsers.slice(0, 5).map((u, i) => `${i+1}. <@${u.id}> (Lv${u.level}, ${u.xp} XP)`));

    // Procesar cada posición configurada
    for (const [posStr, roleId] of Object.entries(cfg.topRoles)) {
      const pos = parseInt(posStr);
      if (isNaN(pos) || !roleId) continue;

      const desiredUser = sortedUsers[pos - 1];
      if (!desiredUser) {
        logger.info(`[TOP ROLES] ⚠️ No hay usuario en posición ${pos}`);
        continue;
      }

      const role = await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        logger.warn(`[TOP ROLES] ⚠️ Rol ${roleId} para Top ${pos} no encontrado`);
        continue;
      }

      logger.info(`[TOP ROLES] 🎯 Procesando Top ${pos} → ${role.name} para <@${desiredUser.id}> (Lv${desiredUser.level}, ${desiredUser.xp} XP);`);

      // Remover rol de TODOS los que lo tienen (usando role.members)
      for (const [memberId, member] of role.members) {
        if (memberId !== desiredUser.id) {
          await member.roles.remove(role).catch(err => {
            logger.error(`[TOP ROLES] ❌ Error quitando Top ${pos} a ${member.user.username}:`, err?.message);
          });
          logger.info(`[TOP ROLES] ➖ Removido Top ${pos} de ${member.user.username}`);
        }
      }

      // Añadir rol al usuario correcto
      const member = await guild.members.fetch(desiredUser.id).catch(() => null);
      if (!member) {
        logger.info(`[TOP ROLES] ⚠️ Usuario ${desiredUser.id} no encontrado en el servidor`);
        continue;
      }

      if (!member.roles.cache.has(roleId)) {
        await member.roles.add(role).catch(err => {
          logger.error(`[TOP ROLES] ❌ Error añadiendo Top ${pos} a ${member.user.username}:`, err?.message);
        });
        logger.info(`[TOP ROLES] ➕ Añadido Top ${pos} a ${member.user.username}`);
      } else {
        logger.info(`[TOP ROLES] ✅ ${member.user.username} ya tiene Top ${pos}`);
      }
    }

    logger.info('[TOP ROLES] ✅ Roles actualizados correctamente');
  } catch (err) {
    logger.error('[TOP ROLES] ❌ Error general:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('toproles')
    .setDescription('Configura roles para los tops del servidor')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Asigna un rol para una posición')
      .addIntegerOption(opt => opt
        .setName('posicion')
        .setDescription('Posición en el ranking (1, 2, 3...)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10))
      .addRoleOption(opt => opt
        .setName('rol')
        .setDescription('Rol a asignar')
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Elimina un rol de una posición')
      .addIntegerOption(opt => opt
        .setName('posicion')
        .setDescription('Posición (1, 2, 3...)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10)))
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('Lista los roles configurados por posición'))
    .addSubcommand(sub => sub
      .setName('update')
      .setDescription('Fuerza actualización manual de roles de top')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'update') {
      await interaction.deferReply({ ephemeral: true });
      await updateTopRoles(interaction.guild);
      return interaction.editReply('✅ Roles de top actualizados manualmente');
    }

    if (subcommand === 'list') {
      const config = readConfig();
      const topRoles = config.topRoles || {};
      
      if (Object.keys(topRoles).length === 0) {
        return interaction.reply({ content: '📋 No hay roles de top configurados', ephemeral: true });
      }

      let list = '**Roles de Top configurados:**\n';
      for (const [pos, roleId] of Object.entries(topRoles).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
        const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
        list += `• Top ${pos}: ${role ? role.toString() : `❌ Rol no encontrado (${roleId})`}\n`;
      }

      return interaction.reply({ content: list, ephemeral: true });
    }

    const config = readConfig();
    config.topRoles = config.topRoles || {};
    
    const position = interaction.options.getInteger('posicion');

    if (subcommand === 'set') {
      const role = interaction.options.getRole('rol');
      
      if (!role.editable) {
        return interaction.reply({
          content: '❌ No puedo gestionar ese rol (está por encima de mi rol más alto)',
          ephemeral: true
        });
      }

      config.topRoles[position] = role.id;
      saveConfig(config);

      await interaction.reply(`✅ Rol ${role} configurado para Top ${position}`);

      // Actualizar roles inmediatamente
      await updateTopRoles(interaction.guild).catch(err => {
        logger.error('[toproles] Error en update after set:', err);
      });

    } else if (subcommand === 'remove') {
      if (!config.topRoles[position]) {
        return interaction.reply({ content: `❌ No hay rol configurado para Top ${position}`, ephemeral: true });
      }

      delete config.topRoles[position];
      saveConfig(config);

      await interaction.reply(`✅ Rol de Top ${position} eliminado`);

      // Actualizar roles inmediatamente
      await updateTopRoles(interaction.guild).catch(err => {
        logger.error('[toproles] Error en update after remove:', err);
      });
    }
  },
  
  updateTopRoles
};
