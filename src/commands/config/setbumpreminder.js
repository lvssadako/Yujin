const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { setBumpReminder } = require('../../utils/bumpReminderStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbumpreminder')
    .setDescription('Configura el canal y rol para el recordatorio de bump')
    .addChannelOption(opt =>
      opt.setName('canal')
        .setDescription('Canal donde se enviará el recordatorio')
        .setRequired(true))
    .addRoleOption(opt =>
      opt.setName('rol')
        .setDescription('Rol a mencionar en el recordatorio')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const channel = interaction.options.getChannel('canal');
    const role = interaction.options.getRole('rol');
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({ content: '❌ Este comando solo puede usarse en un servidor.', ephemeral: true });
    }
    setBumpReminder(guildId, channel.id, role.id);
    await interaction.reply({
      content: `✅ Recordatorio de bump configurado para el canal <#${channel.id}> y el rol <@&${role.id}>.\n\nPuedes ver la configuración actual en cualquier momento usando /bumpreminderinfo.`,
      ephemeral: true
    });
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos de administrador.');
    }
    const channel = message.mentions.channels.first() || (args[0] ? await message.guild.channels.fetch(args[0]).catch(() => null) : null);
    const role = message.mentions.roles.first() || (args[1] ? await message.guild.roles.fetch(args[1]).catch(() => null) : null);
    if (!channel || !role) {
      return message.reply('❌ Uso: `&setbumpreminder #canal @rol`');
    }
    if (!message.guild?.id) {
      return message.reply('❌ Este comando solo puede usarse en un servidor.');
    }
    setBumpReminder(message.guild.id, channel.id, role.id);
    await message.reply(`✅ Recordatorio de bump configurado para el canal <#${channel.id}> y el rol <@&${role.id}>.`);
  }
};
