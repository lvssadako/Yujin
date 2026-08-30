const { EmbedBuilder } = require('discord.js');
const { getActiveReminders, readReminders, writeReminders } = require('../utils/reminderStore');

const timers = new Map();
const MAX_TIMEOUT = 2147483647;

function scheduleReminder(client, reminder) {
    if (timers.has(reminder.id)) {
        clearTimeout(timers.get(reminder.id));
        timers.delete(reminder.id);
    }

    const now = Date.now();
    const delay = reminder.fireAt - now;

    if (delay <= 0) {
        executeReminder(client, reminder);
    } else if (delay > MAX_TIMEOUT) {
        // Handled by hourly checker
        return;
    } else {
        const timer = setTimeout(() => executeReminder(client, reminder), delay);
        timers.set(reminder.id, timer);
    }
}

async function executeReminder(client, reminder) {
    timers.delete(reminder.id);

    const embed = new EmbedBuilder()
        .setColor(0xFAA61A)
        .setAuthor({ name: '⏰ ¡Recordatorio!' })
        .addFields(
            { name: '📝 Mensaje', value: `> ${reminder.message}`, inline: false },
            { name: '⏳ Programado hace', value: `<t:${Math.floor(reminder.createdAt / 1000)}:R>`, inline: false }
        )
        .setFooter({ text: 'LCOBOT Reminders ✨' })
        .setTimestamp();

    let sent = false;
    try {
        const user = await client.users.fetch(reminder.userId);
        if (user) {
            await user.send({ embeds: [embed] });
            sent = true;
        }
    } catch (e) {
        // DM failed
    }

    if (!sent) {
        try {
            const channel = await client.channels.fetch(reminder.channelId);
            if (channel) {
                await channel.send({ content: `<@${reminder.userId}>`, embeds: [embed] });
            }
        } catch (e) {
            // Channel send failed
        }
    }

    const allReminders = readReminders();
    const idx = allReminders.findIndex(r => r.id === reminder.id);
    if (idx !== -1) {
        if (reminder.recurring) {
            let nextMs = 0;
            if (reminder.recurring === 'daily') nextMs = 24 * 60 * 60 * 1000;
            else if (reminder.recurring === 'weekly') nextMs = 7 * 24 * 60 * 60 * 1000;
            
            allReminders[idx].fireAt += nextMs;
            allReminders[idx].createdAt = Date.now();
            writeReminders(allReminders);
            scheduleReminder(client, allReminders[idx]);
        } else {
            allReminders[idx].fired = true;
            writeReminders(allReminders);
        }
    }
}

let reminderHourlyInterval = null;

function init(client) {
    if (reminderHourlyInterval) {
        clearInterval(reminderHourlyInterval);
    }

    const activeReminders = getActiveReminders();
    for (const reminder of activeReminders) {
        scheduleReminder(client, reminder);
    }

    reminderHourlyInterval = setInterval(() => {
        const active = getActiveReminders();
        for (const reminder of active) {
            if (!timers.has(reminder.id)) {
                scheduleReminder(client, reminder);
            }
        }
    }, 60 * 60 * 1000);
}

function stop() {
    if (reminderHourlyInterval) {
        clearInterval(reminderHourlyInterval);
        reminderHourlyInterval = null;
    }
    for (const [id, timer] of timers.entries()) {
        clearTimeout(timer);
    }
    timers.clear();
}

module.exports = {
    init,
    stop,
    scheduleReminder
};
