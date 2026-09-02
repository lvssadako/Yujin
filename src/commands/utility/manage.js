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
  },

  async executePrefix(message, args, client) {
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes permisos de administrador.');
    }
    const group = (args[0] || '').toLowerCase();
    const action = (args[1] || '').toLowerCase();
    const targetUser = message.mentions.users.first() || (args[2] ? await client.users.fetch(args[2]).catch(() => null) : null);
    const guildId = message.guild.id;

    if (group === 'economy' || group === 'eco') {
      if (action === 'check') {
        if (!targetUser) return message.reply('❌ Uso: `&manage economy check @usuario`');
        const bal = getBalance(guildId, targetUser.id);
        return message.reply(`**${targetUser.username}**\n🪙 Monedas: ${bal.coins}\n💎 Gemas: ${bal.gems || 0}`);
      }
      if (action === 'add') {
        const type = (args[2] || 'coins').toLowerCase() === 'gems' ? 'gems' : 'coins';
        const amount = parseInt(args[3], 10);
        const user = message.mentions.users.first() || (args[4] ? await client.users.fetch(args[4]).catch(() => null) : targetUser);
        if (isNaN(amount) || amount < 1 || !user) {
          return message.reply('❌ Uso: `&manage economy add <coins|gems> <cantidad> @usuario`');
        }
        if (type === 'coins') addCoins(guildId, user.id, amount);
        else addGems(guildId, user.id, amount);
        return message.reply(`✅ Añadido ${amount} ${type === 'coins' ? '🪙' : '💎'} a ${user.username}`);
      }
      if (action === 'remove') {
        const type = (args[2] || 'coins').toLowerCase() === 'gems' ? 'gems' : 'coins';
        const amount = parseInt(args[3], 10);
        const user = message.mentions.users.first() || targetUser;
        if (isNaN(amount) || amount < 1 || !user) {
          return message.reply('❌ Uso: `&manage economy remove <coins|gems> <cantidad> @usuario`');
        }
        const success = type === 'coins' ? removeCoins(guildId, user.id, amount) : removeGems(guildId, user.id, amount);
        if (!success) return message.reply('❌ Fondos insuficientes.');
        return message.reply(`✅ Quitado ${amount} ${type === 'coins' ? '🪙' : '💎'} de ${user.username}`);
      }
    } else if (group === 'chest' || group === 'cofre') {
      if (action === 'add') {
        const amount = parseInt(args[2], 10);
        const user = message.mentions.users.first() || (args[3] ? await client.users.fetch(args[3]).catch(() => null) : null);
        if (isNaN(amount) || amount < 1 || !user) return message.reply('❌ Uso: `&manage chest add <cantidad> @usuario`');
        const total = addChests(guildId, user.id, amount);
        return message.reply(`✅ Dado ${amount} cofre(s) a ${user.username}. Total actual: ${total}`);
      }
      if (action === 'check') {
        if (!targetUser) return message.reply('❌ Uso: `&manage chest check @usuario`');
        const count = getChestCount(guildId, targetUser.id);
        return message.reply(`**${targetUser.username}** tiene **${count}** cofres.`);
      }
    }

    return message.reply('❌ Uso: `&manage <economy|chest> <add|remove|check> ...`');
  }
};