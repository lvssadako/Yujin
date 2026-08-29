const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { readProfiles, writeProfiles, ensureUser } = require('../utils/profileStore');

module.exports = {
  name: 'badge',
  description: 'Administra insignias y las de usuarios',
  data: new SlashCommandBuilder()
    .setName('badge')
    .setDescription('Insignias')
    .addSubcommand(s=>s.setName('create').setDescription('Crear/editar insignia')
      .addStringOption(o=>o.setName('id').setDescription('ID única (ej. veteran)').setRequired(true))
      .addStringOption(o=>o.setName('name').setDescription('Nombre').setRequired(true))
      .addStringOption(o=>o.setName('icon').setDescription('URL del icono 64x64').setRequired(true))
      .addStringOption(o=>o.setName('desc').setDescription('Descripción').setRequired(false))
    )
    .addSubcommand(s=>s.setName('delete').setDescription('Eliminar insignia')
      .addStringOption(o=>o.setName('id').setDescription('ID').setRequired(true))
    )
    .addSubcommand(s=>s.setName('give').setDescription('Dar insignia a un usuario')
      .addUserOption(o=>o.setName('user').setDescription('Usuario').setRequired(true))
      .addStringOption(o=>o.setName('id').setDescription('ID de insignia').setRequired(true))
    )
    .addSubcommand(s=>s.setName('revoke').setDescription('Quitar insignia a un usuario')
      .addUserOption(o=>o.setName('user').setDescription('Usuario').setRequired(true))
      .addStringOption(o=>o.setName('id').setDescription('ID de insignia').setRequired(true))
    )
    .addSubcommand(s=>s.setName('equip').setDescription('Equipar para mostrar en el perfil')
      .addStringOption(o=>o.setName('id').setDescription('ID de insignia').setRequired(true))
    )
    .addSubcommand(s=>s.setName('unequip').setDescription('Desequipar')
      .addStringOption(o=>o.setName('id').setDescription('ID de insignia').setRequired(true))
    )
    .addSubcommand(s=>s.setName('list').setDescription('Ver catálogo')),
  async execute(interaction){
    await interaction.deferReply({ ephemeral:true });
    const sub = interaction.options.getSubcommand();
    const profiles = readProfiles();
    profiles.badges ||= {}; // catálogo

    if (sub==='create'){
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.editReply('❌ Permisos insuficientes.');
      const id = interaction.options.getString('id');
      const name = interaction.options.getString('name');
      const icon = interaction.options.getString('icon');
      const desc = interaction.options.getString('desc')||'';
      profiles.badges[id] = { id, name, icon, desc };
      writeProfiles(profiles);
      return interaction.editReply(`✅ Insignia ${name} creada/actualizada.`);
    }
    if (sub==='delete'){
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.editReply('❌ Permisos insuficientes.');
      const id = interaction.options.getString('id');
      delete profiles.badges[id];
      writeProfiles(profiles);
      return interaction.editReply('✅ Insignia eliminada.');
    }
    if (sub==='give' || sub==='revoke'){
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild))
        return interaction.editReply('❌ Permisos insuficientes.');
      const user = interaction.options.getUser('user');
      const id = interaction.options.getString('id');
      if (!profiles.badges[id]) return interaction.editReply('❌ Insignia inexistente.');
      const u = ensureUser(profiles, interaction.guildId, user.id);
      if (sub==='give'){
        if (!u.earnedBadges.includes(id)) u.earnedBadges.push(id);
      } else {
        u.earnedBadges = u.earnedBadges.filter(b=>b!==id);
        u.equippedBadges = u.equippedBadges.filter(b=>b!==id);
      }
      writeProfiles(profiles);
      return interaction.editReply(`✅ ${sub==='give'?'Asignada':'Revocada'} a ${user.tag}.`);
    }
    if (sub==='equip' || sub==='unequip'){
      const id = interaction.options.getString('id');
      const u = ensureUser(profiles, interaction.guildId, interaction.user.id);
      if (!profiles.badges[id]) return interaction.editReply('❌ Insignia inexistente.');
      if (sub==='equip'){
        if (!u.earnedBadges.includes(id)) return interaction.editReply('❌ No tienes esta insignia.');
        if (!u.equippedBadges.includes(id)) {
          // Máximo 5 visibles
          if (u.equippedBadges.length >= 5) return interaction.editReply('⚠️ Máximo 5 insignias equipadas.');
          u.equippedBadges.push(id);
        }
      } else {
        u.equippedBadges = u.equippedBadges.filter(b=>b!==id);
      }
      writeProfiles(profiles);
      return interaction.editReply('✅ Actualizado.');
    }
    if (sub==='list'){
      const list = Object.values(profiles.badges);
      if (!list.length) return interaction.editReply('No hay insignias en el catálogo.');
      const text = list.map(b=>`• ${b.id} — ${b.name}`).join('\n');
      return interaction.editReply({ content: text });
    }
  }
};