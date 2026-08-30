const path = require('path');
const { readJsonSafe, writeJsonAtomic } = require('./jsonStore');

const REMINDERS_FILE = path.join(__dirname, '..', '..', 'data', 'reminders.json');

function readReminders() {
    return readJsonSafe(REMINDERS_FILE, []);
}

function writeReminders(reminders) {
    writeJsonAtomic(REMINDERS_FILE, reminders);
}

function addReminder(reminder) {
    const reminders = readReminders();
    reminders.push(reminder);
    writeReminders(reminders);
}

function removeReminder(id) {
    let reminders = readReminders();
    reminders = reminders.filter(r => r.id !== id);
    writeReminders(reminders);
}

function getActiveReminders() {
    return readReminders().filter(r => !r.fired);
}

function getUserReminders(guildId, userId) {
    return readReminders().filter(r => r.guildId === guildId && r.userId === userId && !r.fired);
}

module.exports = {
    readReminders,
    writeReminders,
    addReminder,
    removeReminder,
    getActiveReminders,
    getUserReminders
};
