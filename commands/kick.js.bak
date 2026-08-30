const logger = require('../src/utils/logger');
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

async function resolveMember(guild, input) {
  if (!input) return null;
  input = input.trim();
  const mention = input.match(/^<@!?(\d+)>$/);
  if (mention) {
    try { return await guild.members.fetch(mention[1]); } catch { return null; }
  }
  if (/^\d{17,19}$/.test(input)) {
    try { return await guild.members.fetch(input); } catch { /* continue */ }
  }
  if (input.includes('#')) {
    const member = guild.members.cache.find(m => m.user.tag.toLowerCase() === input.toLowerCase());
    if (member) return member;
  }
  let member = guild.members.cache.find(m =>
    m.user.username.toLowerCase() === input.toLowerCase() ||
    m.displayName.toLowerCase() === input.toLowerCase()
  );
  if (member) return member;
  try {
    const fetched = await guild.members.fetch({ query: input, limit: 5 });
    if (fetched && fetched.size) return fetched.first();
  } catch {}
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un miembro (acepta mención, ID o nombre)')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(opt => opt.setName('user').setDescription('Selecciona usuario (mención)').setRequired(false))
    .addStringOption(opt => opt.setName('target').setDescription('ID, nombre de usuario o mención (si no usas user)').setRequired(false))
    .addStringOption(opt => opt.setName('reason').setDescription('Razón').setRequired(false)),

  async execute(interaction) {
    try {
      const guild = interaction.guild;
      const userOption = interaction.options.getUser('user');
      const targetInput = interaction.options.getString('target');
      const reason = interaction.options.getString('reason') || 'No especificada';

      let member = null;
      if (userOption) {
        member = await guild.members.fetch(userOption.id).catch(() => null);
      } else if (targetInput) {
        member = await resolveMember(guild, targetInput);
      }

      if (!member) {
        return interaction.reply({ content: '❌ No se encontró el miembro (usa mención, ID o nombre)', ephemeral: true });
      }

      if (member.id === interaction.user.id) return interaction.reply({ content: '❌ No puedes expulsarte a ti mismo', ephemeral: true });

      const me = await guild.members.fetchMe();
      if (!me.permissions.has('KickMembers')) return interaction.reply({ content: '❌ No tengo permiso de expulsar', ephemeral: true });
      if (member.roles.highest.position >= me.roles.highest.position) return interaction.reply({ content: '❌ No puedo expulsar a ese miembro por jerarquía', ephemeral: true });

      await member.kick(`${reason} — por ${interaction.user.tag}`);
      await interaction.reply({ content: `✅ Expulsado: ${member.user.tag} (${member.id})\nRazón: ${reason}` });
    } catch (err) {
      logger.error('kick command error:', err);
      return interaction.reply({ content: '❌ Error al expulsar al miembro', ephemeral: true });
    }
  }
};