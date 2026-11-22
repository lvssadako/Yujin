const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../../utils/ui');
const { readConfig, writeConfig } = require('../../utils/configCache');
const { validateRoleForAssignment } = require('../../utils/roleValidation');
const {
  DEFAULT_INVITE, setStatusTrigger, setTagTrigger, removeTriggersForRole, describeTriggers
} = require('../../services/presenceRoles/triggerAdmin');

const canManage = member => member?.permissions?.has?.(PermissionFlagsBits.Administrator) || member?.permissions?.has?.(PermissionFlagsBits.ManageRoles);

// Lógica común a /statusrole y &statusrole: devuelve { content } o { embed }.
function run(guild, member, sub, role, text) {
  if (!canManage(member)) return { content: '🚫 Necesitas permiso de Administrador o Gestionar Roles.' };
  const current = readConfig().statusRoleTriggers || [];
  if (sub === 'lista') {
    return { embed: createEmbed(COLORS.info).setAuthor({ name: '🎁 Roles por Estado y Tag' }).setDescription(describeTriggers(current)) };
  }
  if (!role) return { content: '❌ Indica un rol (mención o ID).' };
  if (sub === 'quitar') {
    const result = removeTriggersForRole(current, role.id);
    writeConfig(cfg => ({ ...cfg, statusRoleTriggers: result.triggers }));
    return { content: result.removed ? `✅ Se quitaron ${result.removed} regla(s) de ${role}. Quien ya lo tiene lo conserva hasta que se le retire manualmente.` : 'ℹ️ Ese rol no tenía reglas.' };
  }
  const check = validateRoleForAssignment(guild, role.id, 'statusrole command');
  if (!check.valid) return { content: `❌ No puedo gestionar ese rol: debe estar **por debajo** del rol del bot y no ser un rol de integración.` };
  const result = sub === 'tag' ? setTagTrigger(current, role.id) : setStatusTrigger(current, role.id, text || DEFAULT_INVITE);
  if (!result.ok) return { content: `❌ ${result.error}` };
  writeConfig(cfg => ({ ...cfg, statusRoleTriggers: result.triggers }));
  return { content: sub === 'tag'
    ? `✅ Quien muestre el **tag de este servidor** recibirá ${role} y lo perderá al quitarlo.`
    : `✅ Quien tenga \`${text || DEFAULT_INVITE}\` (o un enlace equivalente) en su estado recibirá ${role}. Se retira si lo quita; **no** si solo se pone en invisible.` };
}

module.exports = {
  name: 'statusrole',
  description: 'Configura el rol de agradecimiento por enlace en el estado o tag del servidor',
  data: new SlashCommandBuilder()
    .setName('statusrole')
    .setDescription('Rol de agradecimiento por llevar el enlace del servidor en el estado o su tag')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('estado').setDescription('Rol por tener el enlace en el estado')
      .addRoleOption(o => o.setName('rol').setDescription('Rol a otorgar').setRequired(true))
      .addStringOption(o => o.setName('enlace').setDescription(`Enlace a buscar (por defecto ${DEFAULT_INVITE})`).setMaxLength(100)))
    .addSubcommand(s => s.setName('tag').setDescription('Rol por mostrar el tag de este servidor')
      .addRoleOption(o => o.setName('rol').setDescription('Rol a otorgar').setRequired(true)))
    .addSubcommand(s => s.setName('quitar').setDescription('Elimina las reglas de un rol')
      .addRoleOption(o => o.setName('rol').setDescription('Rol').setRequired(true)))
    .addSubcommand(s => s.setName('lista').setDescription('Muestra las reglas configuradas')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Solo funciona dentro de un servidor.', ephemeral: true });
    const result = run(interaction.guild, interaction.member, interaction.options.getSubcommand(),
      interaction.options.getRole('rol'), interaction.options.getString('enlace'));
    return interaction.reply({ ...(result.embed ? { embeds: [result.embed] } : { content: result.content }), ephemeral: true, allowedMentions: { parse: [] } });
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('❌ Solo funciona dentro de un servidor.');
    const sub = (args[0] || 'lista').toLowerCase();
    if (!['estado', 'tag', 'quitar', 'lista'].includes(sub)) return message.reply('Uso: `&statusrole estado @rol [enlace]`, `tag @rol`, `quitar @rol` o `lista`.');
    const roleArg = message.mentions.roles.first() || message.guild.roles.cache.get(String(args[1] || '').replace(/[<@&>]/g, ''));
    const result = run(message.guild, message.member, sub, roleArg, args.slice(2).join(' ') || null);
    return message.reply({ ...(result.embed ? { embeds: [result.embed] } : { content: result.content }), allowedMentions: { parse: [] } });
  }
};
