// ...existing code...
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const dataDir = path.join(__dirname, '..', 'data');
const levelsPath = path.join(dataDir, 'levels.json');
const cfgPath = path.join(__dirname, '..', 'config.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function readLevels() { try { return JSON.parse(fs.readFileSync(levelsPath, 'utf8')); } catch { return {}; } }
function writeLevels(obj) { fs.writeFileSync(levelsPath, JSON.stringify(obj, null, 2), 'utf8'); }
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; } }
function writeCfg(obj) { fs.writeFileSync(cfgPath, JSON.stringify(obj, null, 2), 'utf8'); }

function xpToNext(level) { return 100 * Math.pow(level + 1, 2); }
function totalXpFromLevel(level, xpProgress) {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpToNext(l);
  total += xpProgress || 0;
  return total;
}
function levelFromTotalXp(total) {
  let level = 0;
  while (true) {
    const need = xpToNext(level);
    if (total >= need) {
      total -= need;
      level++;
    } else break;
  }
  return { level, xp: Math.max(0, total) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leveladmin')
    .setDescription('Administración del sistema de niveles (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('setreward').setDescription('Asigna un rol que se dará al alcanzar un nivel')
      .addIntegerOption(o => o.setName('level').setDescription('Nivel').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Rol a otorgar').setRequired(true)))
    .addSubcommand(s => s.setName('delreward').setDescription('Eliminar reward para un nivel')
      .addIntegerOption(o => o.setName('level').setDescription('Nivel').setRequired(true)))
    // role XP bonus
    .addSubcommand(s => s.setName('setrolexp').setDescription('Configura bonus de XP para un rol (ej: 0.5 = +50%)')
      .addRoleOption(o => o.setName('role').setDescription('Rol').setRequired(true))
      .addNumberOption(o => o.setName('bonus').setDescription('Bonus como decimal (ej: 0.5 = +50%)').setRequired(true)))
    .addSubcommand(s => s.setName('delrolexp').setDescription('Eliminar bonus de XP para un rol')
      .addRoleOption(o => o.setName('role').setDescription('Rol').setRequired(true)))
    .addSubcommand(s => s.setName('listrolexp').setDescription('Listar bonuses por rol'))
    .addSubcommand(s => s.setName('givexp').setDescription('Dar XP a un usuario')
      .addUserOption(u => u.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(i => i.setName('amount').setDescription('Cantidad de XP').setRequired(true)))
    .addSubcommand(s => s.setName('takexp').setDescription('Quitar XP a un usuario')
      .addUserOption(u => u.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(i => i.setName('amount').setDescription('Cantidad de XP').setRequired(true)))
    .addSubcommand(s => s.setName('reset').setDescription('Resetear datos de un usuario')
      .addUserOption(u => u.setName('usuario').setDescription('Usuario').setRequired(true))),
  async execute(interaction) {
    await interaction.deferReply();
    try {
      const sub = interaction.options.getSubcommand();
      const cfg = readCfg();
      const levels = readLevels();
      const guildId = interaction.guildId;
      levels[guildId] = levels[guildId] || {};

      async function applyRewardsAndNotify(userId, oldLevel, newLevel) {
        const rewards = cfg.levelRewards || {};
        const guild = interaction.guild;
        const member = await guild.members.fetch(userId).catch(()=>null);
        for (const [lvlStr, roleId] of Object.entries(rewards)) {
          const lvl = Number(lvlStr);
          if (!roleId) continue;
          if (newLevel >= lvl) {
            if (member && guild.roles.cache.has(roleId)) await member.roles.add(roleId).catch(()=>{});
          } else {
            if (member && guild.roles.cache.has(roleId)) await member.roles.remove(roleId).catch(()=>{});
          }
        }
        if (newLevel > oldLevel) {
          const notifyChannel = cfg.levelUpChannelId ? (interaction.guild.channels.cache.get(cfg.levelUpChannelId) || null) : null;
          let content = `:LcoSaboreandoMiNitro: <@${userId}> subió al nivel ${newLevel}!`;
          // añadir roles ganados por alcanzar niveles (si aplica)
          const gained = [];
          const rewardsMap = cfg.levelRewards || {};
          for (const [lvlStr, roleId] of Object.entries(rewardsMap)) {
            const lvl = Number(lvlStr);
            if (oldLevel < lvl && newLevel >= lvl) gained.push(roleId);
          }
          if (gained.length) {
            const mentions = gained.map(rid => (interaction.guild.roles.cache.has(rid) ? `<@&${rid}>` : rid));
            content += ` Ganó: ${mentions.join(', ')}`;
          }
          try {
            if (notifyChannel) await notifyChannel.send({ content }).catch(()=>{});
            else await interaction.followUp({ content, ephemeral: true }).catch(()=>{});
          } catch {}
        }
      }

      if (sub === 'setrolexp') {
        const role = interaction.options.getRole('role');
        let bonus = interaction.options.getNumber('bonus');

        if (typeof bonus === 'number' && bonus > 1) bonus = bonus / 100;

        if (typeof bonus !== 'number' || isNaN(bonus) || bonus < 0 || bonus > 10) {
          return interaction.editReply({ content: 'Valor inválido. Usa decimal (ej. 0.5 = 50%) o porcentaje (ej. 50 = 50%). Máx permitido: +1000%.', ephemeral: true });
        }

        cfg.roleXpBonuses = cfg.roleXpBonuses || {};
        cfg.roleXpBonuses[role.id] = Number(bonus);
        writeCfg(cfg);

        return interaction.editReply({ content: `✅ Bonus configurado: ${role} → +${(bonus * 100).toFixed(0)}%`, ephemeral: true });
      }

      if (sub === 'delrolexp') {
        const role = interaction.options.getRole('role');
        cfg.roleXpBonuses = cfg.roleXpBonuses || {};
        if (cfg.roleXpBonuses[role.id]) {
          delete cfg.roleXpBonuses[role.id];
          writeCfg(cfg);
          return interaction.editReply({ content: `✅ Bonus eliminado para ${role}`, ephemeral: true });
        } else {
          return interaction.editReply({ content: `⚠️ No había bonus configurado para ${role}`, ephemeral: true });
        }
      }

      if (sub === 'listrolexp') {
        const map = cfg.roleXpBonuses || {};
        const entries = Object.entries(map).sort((a,b)=> (Number(map[b[0]]) - Number(map[a[0]])));
        if (entries.length === 0) return interaction.editReply({ content: 'No hay bonuses por rol configurados.', ephemeral: true });
        const lines = entries.map(([rid, bonus]) => {
          const role = interaction.guild.roles.cache.get(rid);
          return `${role ? `${role}` : rid} — +${(Number(bonus)*100).toFixed(0)}%`;
        });
        return interaction.editReply({ content: lines.join('\n'), ephemeral: true });
      }

      // restante: setreward / delreward / givexp / takexp / reset (mantener comportamiento previo)
      if (sub === 'setreward') {
        const lvl = interaction.options.getInteger('level');
        const role = interaction.options.getRole('role');
        cfg.levelRewards = cfg.levelRewards || {};
        cfg.levelRewards[String(lvl)] = role.id;
        writeCfg(cfg);
        return interaction.editReply({ content: `✅ Recompensa registrada: nivel ${lvl} → ${role}`, ephemeral: true });
      }
      if (sub === 'delreward') {
        const lvl = interaction.options.getInteger('level');
        cfg.levelRewards = cfg.levelRewards || {};
        if (cfg.levelRewards[String(lvl)]) {
          const removed = cfg.levelRewards[String(lvl)];
          delete cfg.levelRewards[String(lvl)];
          writeCfg(cfg);
          return interaction.editReply({ content: `✅ Recompensa eliminada para nivel ${lvl} (rol ${removed}).`, ephemeral: true });
        } else {
          return interaction.editReply({ content: `⚠️ No había recompensa configurada para nivel ${lvl}.`, ephemeral: true });
        }
      }

      if (sub === 'givexp' || sub === 'takexp' || sub === 'reset') {
        const user = interaction.options.getUser('usuario');
        const amount = interaction.options.getInteger('amount') || 0;
        const current = levels[guildId][user.id] || { xp: 0, level: 0 };

        if (sub === 'givexp') {
          const totalBefore = totalXpFromLevel(current.level || 0, current.xp || 0);
          const totalAfter = totalBefore + amount;
          const { level: newLevel, xp: newXp } = levelFromTotalXp(totalAfter);
          const oldLevel = current.level || 0;
          levels[guildId][user.id] = { xp: newXp, level: newLevel };
          writeLevels(levels);
          await applyRewardsAndNotify(user.id, oldLevel, newLevel);
          return interaction.editReply({ content: `✅ Se dieron ${amount} XP a ${user.tag}. Nivel: ${oldLevel} → ${newLevel}`, ephemeral: true });
        }
        if (sub === 'takexp') {
          const totalBefore = totalXpFromLevel(current.level || 0, current.xp || 0);
          const totalAfter = Math.max(0, totalBefore - amount);
          const { level: newLevel, xp: newXp } = levelFromTotalXp(totalAfter);
          const oldLevel = current.level || 0;
          levels[guildId][user.id] = { xp: newXp, level: newLevel };
          writeLevels(levels);
          await applyRewardsAndNotify(user.id, oldLevel, newLevel);
          return interaction.editReply({ content: `✅ Se quitaron ${amount} XP a ${user.tag}. Nivel: ${oldLevel} → ${newLevel}`, ephemeral: true });
        }
        if (sub === 'reset') {
          delete levels[guildId][user.id];
          writeLevels(levels);
          return interaction.editReply({ content: `✅ Datos de niveles reseteados para ${user.tag}`, ephemeral: true });
        }
      }

      return interaction.editReply({ content: 'Subcomando desconocido.', ephemeral: true });
    } catch (err) {
      console.error('leveladmin error:', err);
      return interaction.editReply('❌ Error en el comando');
    }
  }
};