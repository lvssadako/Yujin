const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getBalance } = require('../../../services/economy').economyService;
const { getXpMultiplier } = require('../../../services/level').levelService;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Ver tu balance')
    .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const { coins, gems } = getBalance(interaction.guildId, target.id);

    const embed = new EmbedBuilder()
      .setColor(0xF6C343)
      .setTitle(`💰 Balance de ${target.username}`)
      .addFields(
        { name: '🪙 Monedas', value: String(coins), inline: true },
        { name: '💎 Gemas', value: String(gems), inline: true }
      );

    return interaction.reply({ embeds: [embed] });
  },

  async executePrefix(message, args, client) {
    if (!message.guild || !message.member) {
      return message.reply('❌ Este comando solo puede usarse en servidores.');
    }

    // Buscar usuario objetivo: mención, id o nombre
    let targetUser = message.author;
    if (message.mentions.users.size > 0) {
      targetUser = message.mentions.users.first();
    } else if (args.length > 0) {
      const arg = args[0].replace(/[<@!>]/g, '');
      let user = message.guild.members.cache.get(arg)?.user;
      if (!user) {
        user = message.guild.members.cache.find(m =>
          m.user.username.toLowerCase() === arg.toLowerCase() ||
          m.user.tag.toLowerCase() === arg.toLowerCase()
        )?.user;
      }
      if (user) targetUser = user;
    }

    const { coins, gems } = getBalance(message.guild.id, targetUser.id);

    const embed = new EmbedBuilder()
      .setColor(0xF6C343)
      .setTitle(`💰 Balance de ${targetUser.username}`)
      .addFields(
        { name: '🪙 Monedas', value: String(coins), inline: true },
        { name: '💎 Gemas', value: String(gems), inline: true }
      );

    return message.reply({ embeds: [embed] });
  }
};