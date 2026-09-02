const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', '..', 'data', 'bump_reminder.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); }
  catch { return {}; }
}
function writeConfig(obj) {
  fs.writeFileSync(configPath, JSON.stringify(obj, null, 2), 'utf8');
}

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
    const config = readConfig();
    config[guildId] = {
      channelId: channel.id,
      roleId: role.id
    };
    writeConfig(config);
    await interaction.reply({
      content: `✅ Recordatorio de bump configurado para el canal <#${channel.id}> y el rol <@&${role.id}>.\n\nPuedes ver la configuración actual en cualquier momento usando /bumpreminderinfo.`,
      ephemeral: true
    });
  }
};
