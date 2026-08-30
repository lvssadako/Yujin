const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addCoins, removeCoins } = require('../../services/economy').economyService;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ecoadmin')
    .setDescription('Administra la economía del servidor de forma manual.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub => sub.setName('addmoney').setDescription('Añade monedas a un usuario')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(opt => opt.setName('cantidad').setDescription('Monedas a dar').setRequired(true)))
    .addSubcommand(sub => sub.setName('removemoney').setDescription('Quita monedas de la billetera de un usuario')
      .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption(opt => opt.setName('cantidad').setDescription('Monedas a quitar').setRequired(true))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const target = interaction.options.getUser('usuario');
    const amount = interaction.options.getInteger('cantidad');
    
    if (amount <= 0) return interaction.reply({ content: '❌ La cantidad debe ser mayor a 0.', ephemeral: true });
    
    if (sub === 'addmoney') {
      addCoins(interaction.guildId, target.id, amount);
      const emb = new EmbedBuilder().setColor(0x57F287).setDescription(`✅ Has añadido **${amount.toLocaleString()} 🪙** a la billetera de **${target.tag}**.`);
      await interaction.reply({ embeds: [emb] });
    } 
    else if (sub === 'removemoney') {
      const success = removeCoins(interaction.guildId, target.id, amount);
      if (!success) {
        return interaction.reply({ content: `❌ El usuario no tiene suficientes monedas en su billetera para quitarle ${amount}.`, ephemeral: true });
      }
      const emb = new EmbedBuilder().setColor(0xED4245).setDescription(`✅ Has quitado **${amount.toLocaleString()} 🪙** de la billetera de **${target.tag}**.`);
      await interaction.reply({ embeds: [emb] });
    }
  }
};
