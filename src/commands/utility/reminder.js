const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addReminder, getUserReminders, readReminders, writeReminders } = require('../../utils/reminderStore');
const crypto = require('crypto');
const reminderLoader = require('../../events/reminderLoader');

function parseTime(timeStr) {
    const match = timeStr.match(/^(\d+)(m|h|d|w)$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reminder')
        .setDescription('Sistema premium de recordatorios')
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Programa un nuevo recordatorio')
                .addStringOption(option =>
                    option.setName('mensaje')
                        .setDescription('El mensaje del recordatorio')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('tiempo')
                        .setDescription('Tiempo (ej. 5m, 1h, 2d, 1w)')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('repetir')
                        .setDescription('Repetir el recordatorio')
                        .addChoices(
                            { name: 'Diario', value: 'daily' },
                            { name: 'Semanal', value: 'weekly' }
                        )
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Muestra tus recordatorios activos'))
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Elimina un recordatorio específico')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('El ID del recordatorio a eliminar')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('clear')
                .setDescription('Elimina todos tus recordatorios')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const client = interaction.client;
        
        if (subcommand === 'set') {
            const message = interaction.options.getString('mensaje');
            const timeStr = interaction.options.getString('tiempo');
            const repeat = interaction.options.getString('repetir');
            
            const ms = parseTime(timeStr);
            if (!ms) {
                return interaction.reply({ content: '❌ Formato de tiempo inválido. Usa 5m, 1h, 2d, 1w.', ephemeral: true });
            }
            
            const now = Date.now();
            const fireAt = now + ms;
            const id = crypto.randomBytes(4).toString('hex');
            
            const reminder = {
                id,
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                userId: interaction.user.id,
                message,
                createdAt: now,
                fireAt,
                recurring: repeat || null,
                fired: false
            };
            
            addReminder(reminder);
            reminderLoader.scheduleReminder(client, reminder);
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: '⏰ Recordatorio Programado' })
                .addFields(
                    { name: '📝 Mensaje', value: `> ${message}`, inline: false },
                    { name: '⏳ Dispara', value: `<t:${Math.floor(fireAt / 1000)}:F> (<t:${Math.floor(fireAt / 1000)}:R>)`, inline: false },
                    { name: '🔁 Tipo', value: repeat === 'daily' ? 'Diario' : repeat === 'weekly' ? 'Semanal' : 'Único', inline: false }
                )
                .setFooter({ text: 'Te enviaré un DM cuando sea hora ✨ ID: ' + id })
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }
        
        if (subcommand === 'list') {
            const reminders = getUserReminders(interaction.guild.id, interaction.user.id);
            if (!reminders.length) {
                return interaction.reply({ content: 'No tienes recordatorios activos.', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: '⏰ Tus Recordatorios' })
                .setDescription(reminders.map((r, i) => `🔔 \`#${i + 1}\` (ID: ${r.id}) | "> ${r.message.substring(0, 30)}${r.message.length > 30 ? '...' : ''}" | <t:${Math.floor(r.fireAt / 1000)}:R>`).join('\n'))
                .setFooter({ text: `Tienes ${reminders.length} recordatorio(s) ✨` })
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }
        
        if (subcommand === 'delete') {
            const id = interaction.options.getString('id');
            const reminders = readReminders();
            const reminderIndex = reminders.findIndex(r => r.id === id && r.guildId === interaction.guild.id && r.userId === interaction.user.id);
            if (reminderIndex === -1) {
                return interaction.reply({ content: '❌ No se encontró el recordatorio o no es tuyo.', ephemeral: true });
            }
            reminders.splice(reminderIndex, 1);
            writeReminders(reminders);
            return interaction.reply({ content: `✅ Recordatorio \`${id}\` eliminado.`, ephemeral: true });
        }
        
        if (subcommand === 'clear') {
            const reminders = readReminders();
            const newReminders = reminders.filter(r => !(r.guildId === interaction.guild.id && r.userId === interaction.user.id && !r.fired));
            writeReminders(newReminders);
            return interaction.reply({ content: '✅ Todos tus recordatorios han sido eliminados.', ephemeral: true });
        }
    },

    async executePrefix(message, args) {
        if (!args.length) return message.reply('❌ Uso: &reminder <set|list|delete|clear>');
        const client = message.client;
        const subcommand = args[0].toLowerCase();
        
        if (subcommand === 'set') {
            if (args.length < 3) return message.reply('❌ Uso: &reminder set <tiempo> <mensaje>');
            const timeStr = args[1];
            const msg = args.slice(2).join(' ');
            
            const ms = parseTime(timeStr);
            if (!ms) return message.reply('❌ Formato de tiempo inválido. Usa 5m, 1h, 2d, 1w.');
            
            const now = Date.now();
            const fireAt = now + ms;
            const id = crypto.randomBytes(4).toString('hex');
            
            const reminder = {
                id,
                guildId: message.guild.id,
                channelId: message.channel.id,
                userId: message.author.id,
                message: msg,
                createdAt: now,
                fireAt,
                recurring: null,
                fired: false
            };
            
            addReminder(reminder);
            reminderLoader.scheduleReminder(client, reminder);
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: '⏰ Recordatorio Programado' })
                .addFields(
                    { name: '📝 Mensaje', value: `> ${msg}`, inline: false },
                    { name: '⏳ Dispara', value: `<t:${Math.floor(fireAt / 1000)}:F> (<t:${Math.floor(fireAt / 1000)}:R>)`, inline: false },
                    { name: '🔁 Tipo', value: 'Único', inline: false }
                )
                .setFooter({ text: 'Te enviaré un DM cuando sea hora ✨ ID: ' + id })
                .setTimestamp();
                
            return message.reply({ embeds: [embed] });
        }
        
        if (subcommand === 'list') {
            const reminders = getUserReminders(message.guild.id, message.author.id);
            if (!reminders.length) {
                return message.reply('No tienes recordatorios activos.');
            }
            
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setAuthor({ name: '⏰ Tus Recordatorios' })
                .setDescription(reminders.map((r, i) => `🔔 \`#${i + 1}\` (ID: ${r.id}) | "> ${r.message.substring(0, 30)}${r.message.length > 30 ? '...' : ''}" | <t:${Math.floor(r.fireAt / 1000)}:R>`).join('\n'))
                .setFooter({ text: `Tienes ${reminders.length} recordatorio(s) ✨` })
                .setTimestamp();
                
            return message.reply({ embeds: [embed] });
        }
        
        if (subcommand === 'delete') {
            if (args.length < 2) return message.reply('❌ Uso: &reminder delete <id>');
            const id = args[1];
            const reminders = readReminders();
            const reminderIndex = reminders.findIndex(r => r.id === id && r.guildId === message.guild.id && r.userId === message.author.id);
            if (reminderIndex === -1) return message.reply('❌ No se encontró el recordatorio o no es tuyo.');
            reminders.splice(reminderIndex, 1);
            writeReminders(reminders);
            return message.reply(`✅ Recordatorio \`${id}\` eliminado.`);
        }
        
        if (subcommand === 'clear') {
            const reminders = readReminders();
            const newReminders = reminders.filter(r => !(r.guildId === message.guild.id && r.userId === message.author.id && !r.fired));
            writeReminders(newReminders);
            return message.reply('✅ Todos tus recordatorios han sido eliminados.');
        }
    }
};
