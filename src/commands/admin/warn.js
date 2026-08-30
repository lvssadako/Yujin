
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { readWarns, writeWarns } = require('../../utils/warnStore');
const crypto = require('crypto');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Sistema de advertencias.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(sub => sub.setName('add').setDescription('Advierte a un usuario.')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a advertir').setRequired(true))
      .addStringOption(opt => opt.setName('razon').setDescription('Razón de la advertencia').setRequired(true)))
    .addSubcommand(sub => sub.setName('list').setDescription('Lista las advertencias de un usuario.')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(sub => sub.setName('remove').setDescription('Elimina una advertencia específica.')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption(opt => opt.setName('id').setDescription('ID de la advertencia').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('usuario');
    const guildId = interaction.guildId;
    let warns = readWarns();
    if (!warns[guildId]) warns[guildId] = {};
    if (!warns[guildId][target.id]) warns[guildId][target.id] = [];
    
    if (sub === 'add') {
      const reason = interaction.options.getString('razon');
      const warnId = crypto.randomBytes(3).toString('hex');
      warns[guildId][target.id].push({ id: warnId, reason, date: Date.now(), modId: interaction.user.id });
      writeWarns(warns);
      
      const emb = new EmbedBuilder().setColor(0xFFA500).setTitle('⚠️ Usuario Advertido')
        .setDescription(`**${target.tag}** ha recibido una advertencia.\\n**Razón:** ${reason}\\n**ID:** \`${warnId}\``);
      await interaction.reply({ embeds: [emb] });
      
      try { await target.send(`Has recibido una advertencia en **${interaction.guild.name}**. Razón: ${reason}`); } catch (e) {}
    } 
    else if (sub === 'list') {
      const userWarns = warns[guildId][target.id];
      if (userWarns.length === 0) return interaction.reply({ content: '✅ Este usuario no tiene advertencias.', ephemeral: true });
      
      const emb = new EmbedBuilder().setColor(0x5865F2).setTitle(`📋 Advertencias de ${target.tag}`)
        .setDescription(userWarns.map((w, i) => `**\${i+1}.** [\`${w.id}\`] - \${w.reason} (Por: <@\${w.modId}>)`).join('\\n'));
      await interaction.reply({ embeds: [emb] });
    }
    else if (sub === 'remove') {
      const id = interaction.options.getString('id');
      const initLen = warns[guildId][target.id].length;
      warns[guildId][target.id] = warns[guildId][target.id].filter(w => w.id !== id);
      if (warns[guildId][target.id].length === initLen) return interaction.reply({ content: '❌ ID no encontrado.', ephemeral: true });
      writeWarns(warns);
      await interaction.reply({ content: `✅ Advertencia \`${id}\` eliminada para ${target.tag}.` });
    }
  }
};
