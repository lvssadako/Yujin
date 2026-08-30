const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const cfgPath = path.join(__dirname, '..', 'config.json');
function readCfg() { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; } }
function writeCfg(obj) { fs.writeFileSync(cfgPath, JSON.stringify(obj, null, 2), 'utf8'); }

module.exports = {
  data: new SlashCommandBuilder()
    .setName('levelrewards')
    .setDescription('Listar/Configurar recompensas de nivel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s => s.setName('list').setDescription('Lista las recompensas por nivel'))
    .addSubcommand(s => s
      .setName('setchannel')
      .setDescription('Configura el canal de notificaciones de level-up')
      .addChannelOption(c => c.setName('canal').setDescription('Canal donde el bot anunciará level-ups').setRequired(true))
    )
    .addSubcommand(s => s
      .setName('clearchannel')
      .setDescription('Quitar canal de notificaciones')
    ),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    const cfg = readCfg();

    if (sub === 'list') {
      const rewards = cfg.levelRewards || {};
      const entries = Object.entries(rewards).map(([lvl, roleId]) => ({ lvl: Number(lvl), roleId }))
        .sort((a, b) => a.lvl - b.lvl);

      if (entries.length === 0) {
        return interaction.reply({ content: 'No hay recompensas configuradas.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🎁 Recompensas por nivel')
        .setColor(0x8BD3FF)
        .setTimestamp();

      for (const e of entries) {
        const role = interaction.guild.roles.cache.get(e.roleId);
        const display = role ? `${role}` : 'Rol no encontrado';
        embed.addFields({ name: `Nivel ${e.lvl}`, value: display, inline: false });
      }

      if (cfg.levelUpChannelId) {
        const ch = interaction.guild.channels.cache.get(cfg.levelUpChannelId);
        if (ch) embed.setFooter({ text: `Notificaciones en: #${ch.name}` });
      }

      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    // Las siguientes acciones requieren permisos de ADMIN o MANAGE_GUILD
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'Necesitas permisos de Administrador o Administrar servidor para esto.', ephemeral: true });
    }

    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('canal');
      cfg.levelUpChannelId = channel.id;
      writeCfg(cfg);
      return interaction.reply({ content: `✅ Canal de notificaciones establecido en: ${channel}`, ephemeral: true });
    }

    if (sub === 'clearchannel') {
      delete cfg.levelUpChannelId;
      writeCfg(cfg);
      return interaction.reply({ content: '✅ Canal de notificaciones eliminado.', ephemeral: true });
    }

    return interaction.reply({ content: 'Subcomando desconocido.', ephemeral: true });
  }
};