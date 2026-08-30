const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getBalance, addCoins, removeCoins, addGems, removeGems } = require('../../services/economy/index').economyService;
const { addChests, removeChest, getChestCount } = require('../../utils/chestStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manage')
    .setDescription('Gestión de economía y cofres')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommandGroup(g => g
      .setName('economy')
      .setDescription('Gestionar economía')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('Añadir monedas/gemas a un usuario o a todo el servidor')
        .addStringOption(o => o.setName('type').setDescription('Tipo').setRequired(true)
          .addChoices(
            { name: '🪙 Monedas', value: 'coins' },
            { name: '💎 Gemas', value: 'gems' }
          ))
        .addIntegerOption(o => o.setName('amount').setDescription('Cantidad').setRequired(true).setMinValue(1))
        .addUserOption(o => o.setName('user').setDescription('Usuario (opcional)').setRequired(false))
        .addBooleanOption(o => o.setName('everyone').setDescription('Agregar a todos los usuarios').setRequired(false)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('Quitar monedas/gemas a un usuario')
        .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Tipo').setRequired(true)
          .addChoices(
            { name: '🪙 Monedas', value: 'coins' },
            { name: '💎 Gemas', value: 'gems' }
          ))
        .addIntegerOption(o => o.setName('amount').setDescription('Cantidad').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s
        .setName('set')
        .setDescription('Establecer monedas/gemas exactas')
        .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Tipo').setRequired(true)
          .addChoices(
            { name: '🪙 Monedas', value: 'coins' },
            { name: '💎 Gemas', value: 'gems' }
          ))
        .addIntegerOption(o => o.setName('amount').setDescription('Cantidad exacta').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s
        .setName('check')
        .setDescription('Ver balance de un usuario')
        .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))))
    .addSubcommandGroup(g => g
      .setName('chest')
      .setDescription('Gestionar cofres')
      .addSubcommand(s => s
        .setName('add')
        .setDescription('Dar cofres a un usuario')
        .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Cantidad').setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s
        .setName('remove')
        .setDescription('Quitar cofres a un usuario')
        .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Cantidad').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s
        .setName('check')
        .setDescription('Ver cofres de un usuario')
        .addUserOption(o => o.setName('user').setDescription('Usuario').setRequired(true)))),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user');
    const guildId = interaction.guildId;

    if (group === 'economy') {
      const type = interaction.options.getString('type');
      const amount = interaction.options.getInteger('amount');

      if (sub === 'check') {
        const bal = getBalance(guildId, targetUser.id);
        return interaction.reply({
          content: `**${targetUser.username}**\n🪙 Monedas: ${bal.coins}\n💎 Gemas: ${bal.gems || 0}`,
          ephemeral: true
        });
      }

      if (sub === 'add') {
        const everyone = interaction.options.getBoolean('everyone');
        const user = interaction.options.getUser('user');
        const emoji = type === 'coins' ? '🪙' : '💎';
        if (everyone) {
          // Agregar a todos los usuarios del servidor
          const members = await interaction.guild.members.fetch();
          let count = 0;
          for (const member of members.values()) {
            if (member.user.bot) continue;
            if (type === 'coins') {
              addCoins(guildId, member.user.id, amount);
            } else {
              addGems(guildId, member.user.id, amount);
            }
            count++;
          }
          return interaction.reply({
            content: `✅ Añadido ${amount}${emoji} a todos los usuarios (${count}) del servidor`,
            ephemeral: true
          });
        } else if (user) {
          if (type === 'coins') {
            addCoins(guildId, user.id, amount);
          } else {
            addGems(guildId, user.id, amount);
          }
          return interaction.reply({
            content: `✅ Añadido ${amount}${emoji} a ${user.username}`,
            ephemeral: true
          });
        } else {
          return interaction.reply({
            content: '❌ Debes especificar un usuario o activar "everyone" para todos.',
            ephemeral: true
          });
        }
      }

      if (sub === 'remove') {
        const success = type === 'coins' 
          ? removeCoins(guildId, targetUser.id, amount)
          : removeGems(guildId, targetUser.id, amount);
        
        if (!success) {
          return interaction.reply({ content: '❌ Fondos insuficientes', ephemeral: true });
        }
        const emoji = type === 'coins' ? '🪙' : '💎';
        return interaction.reply({
          content: `✅ Quitado ${amount}${emoji} de ${targetUser.username}`,
          ephemeral: true
        });
      }

      if (sub === 'set') {
        const { readEconomy, writeEconomy, ensureUserEcon } = require('../../services/economy/index').economyService;
        const econ = readEconomy();
        const u = ensureUserEcon(econ, guildId, targetUser.id);
        
        if (type === 'coins') {
          u.coins = amount;
        } else {
          u.gems = amount;
        }
        writeEconomy(econ);
        
        const emoji = type === 'coins' ? '🪙' : '💎';
        return interaction.reply({
          content: `✅ ${targetUser.username} ahora tiene ${amount}${emoji}`,
          ephemeral: true
        });
      }
    }

    if (group === 'chest') {
      if (sub === 'check') {
        const count = getChestCount(guildId, targetUser.id);
        return interaction.reply({
          content: `**${targetUser.username}** tiene **${count}** <:chest:1439431665704239236> cofres`,
          ephemeral: true
        });
      }

      if (sub === 'add') {
        const amount = interaction.options.getInteger('amount');
        const total = addChests(guildId, targetUser.id, amount);
        return interaction.reply({
          content: `✅ Dado ${amount} cofre${amount > 1 ? 's' : ''} a ${targetUser.username}\nTotal ahora: ${total}`,
          ephemeral: true
        });
      }

      if (sub === 'remove') {
        const amount = interaction.options.getInteger('amount');
        const current = getChestCount(guildId, targetUser.id);
        
        if (current < amount) {
          return interaction.reply({
            content: `❌ ${targetUser.username} solo tiene ${current} cofres`,
            ephemeral: true
          });
        }

        for (let i = 0; i < amount; i++) {
          removeChest(guildId, targetUser.id);
        }

        const remaining = getChestCount(guildId, targetUser.id);
        return interaction.reply({
          content: `✅ Quitado ${amount} cofre${amount > 1 ? 's' : ''} de ${targetUser.username}\nRestantes: ${remaining}`,
          ephemeral: true
        });
      }
    }
  }
};