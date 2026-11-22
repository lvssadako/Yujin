const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { createEmbed, COLORS } = require('../../utils/ui');
const { readConfig, writeConfig } = require('../../utils/configCache');
const { validateRoleForAssignment } = require('../../utils/roleValidation');
const { addShopRole, removeShopRole, describeShopRoles } = require('../../services/shop/shopRolesAdmin');

const canManage = m => m?.permissions?.has?.(PermissionFlagsBits.Administrator) || m?.permissions?.has?.(PermissionFlagsBits.ManageRoles);

// Lógica común a /shopadmin y &shopadmin: { content } o { embed }.
function run(guild, member, sub, opts) {
  if (!canManage(member)) return { content: '🚫 Necesitas permiso de Administrador o Gestionar Roles.' };
  const current = readConfig().shopRoles || [];
  if (sub === 'lista') return { embed: createEmbed(COLORS.economy).setAuthor({ name: '🎭 Roles de la tienda' }).setDescription(describeShopRoles(current)) };
  if (sub === 'rol-quitar') {
    const r = removeShopRole(current, String(opts.id || '').toLowerCase());
    if (!r.ok) return { content: `❌ ${r.error}` };
    writeConfig(cfg => ({ ...cfg, shopRoles: r.roles }));
    return { content: '✅ Rol quitado de la tienda. Quien ya lo compró lo conserva hasta que venza.' };
  }
  if (sub === 'rol-agregar') {
    if (!opts.role) return { content: '❌ Indica un rol.' };
    if (!validateRoleForAssignment(guild, opts.role.id, 'shopadmin').valid) {
      return { content: '❌ No puedo gestionar ese rol: debe estar **por debajo** del rol del bot y no ser un rol de integración.' };
    }
    const r = addShopRole(current, { name: opts.nombre, price: opts.precio, days: opts.dias, roleId: opts.role.id, description: opts.descripcion });
    if (!r.ok) return { content: `❌ ${r.error}` };
    writeConfig(cfg => ({ ...cfg, shopRoles: r.roles }));
    return { content: `✅ ${r.replaced ? 'Actualizado' : 'Agregado'}: **${r.entry.name}** (${r.entry.id}) → ${opts.role} por ${r.entry.price.toLocaleString('es-MX')} 🪙 · ${r.entry.days > 0 ? r.entry.days + ' días' : 'permanente'}.` };
  }
  return { content: 'Uso: `rol-agregar`, `rol-quitar` o `lista`.' };
}

module.exports = {
  name: 'shopadmin',
  description: 'Configura los roles que se venden en la tienda',
  data: new SlashCommandBuilder()
    .setName('shopadmin')
    .setDescription('Administra los roles que se venden en /shop')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('rol-agregar').setDescription('Vende un rol en la tienda')
      .addStringOption(o => o.setName('nombre').setDescription('Nombre visible del producto').setRequired(true).setMaxLength(40))
      .addRoleOption(o => o.setName('rol').setDescription('Rol que se entrega').setRequired(true))
      .addIntegerOption(o => o.setName('precio').setDescription('Precio en monedas').setRequired(true).setMinValue(1).setMaxValue(100000000))
      .addIntegerOption(o => o.setName('dias').setDescription('Duración en días (0 = permanente)').setRequired(true).setMinValue(0).setMaxValue(365))
      .addStringOption(o => o.setName('descripcion').setDescription('Descripción corta').setMaxLength(120)))
    .addSubcommand(s => s.setName('rol-quitar').setDescription('Quita un rol de la tienda')
      .addStringOption(o => o.setName('id').setDescription('ID del producto (ver /shopadmin lista)').setRequired(true)))
    .addSubcommand(s => s.setName('lista').setDescription('Muestra los roles a la venta')),

  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: '❌ Solo funciona dentro de un servidor.', ephemeral: true });
    const o = interaction.options;
    const result = run(interaction.guild, interaction.member, o.getSubcommand(), {
      nombre: o.getString('nombre'), role: o.getRole('rol'), precio: o.getInteger('precio'), dias: o.getInteger('dias'),
      descripcion: o.getString('descripcion'), id: o.getString('id')
    });
    return interaction.reply({ ...(result.embed ? { embeds: [result.embed] } : { content: result.content }), ephemeral: true, allowedMentions: { parse: [] } });
  },

  async executePrefix(message, args) {
    if (!message.guild) return message.reply('❌ Solo funciona dentro de un servidor.');
    const sub = (args[0] || 'lista').toLowerCase();
    let opts = {};
    if (sub === 'rol-agregar') {
      // &shopadmin rol-agregar @rol <precio> <días> <nombre...>
      const role = message.mentions.roles.first() || message.guild.roles.cache.get(String(args[1] || '').replace(/[<@&>]/g, ''));
      opts = { role, precio: Number(args[2]), dias: Number(args[3]), nombre: args.slice(4).join(' ') };
      if (!role || !opts.nombre) return message.reply('Uso: `&shopadmin rol-agregar @rol <precio> <días> <nombre>` (días 0 = permanente).');
    } else if (sub === 'rol-quitar') opts = { id: args[1] };
    const result = run(message.guild, message.member, sub, opts);
    return message.reply({ ...(result.embed ? { embeds: [result.embed] } : { content: result.content }), allowedMentions: { parse: [] } });
  }
};
