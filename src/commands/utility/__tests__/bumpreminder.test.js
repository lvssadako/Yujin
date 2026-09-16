const test = require('node:test');
const assert = require('node:assert/strict');

const infoCommand = require('../bumpreminderinfo');
const setCommand = require('../../config/setbumpreminder');

test('bump reminder commands expose slash and prefix handlers', () => {
  for (const command of [infoCommand, setCommand]) {
    assert.equal(typeof command.execute, 'function');
    assert.equal(typeof command.executePrefix, 'function');
  }
});

test('bump reminder info rejects direct-message execution in both modes', async () => {
  let slashReply;
  await infoCommand.execute({
    guildId: null,
    reply: async payload => { slashReply = payload; }
  });
  assert.match(slashReply.content, /solo puede usarse en un servidor/i);

  let prefixReply;
  await infoCommand.executePrefix({
    guild: null,
    reply: async payload => { prefixReply = payload; }
  }, [], null);
  assert.match(prefixReply, /solo puede usarse en un servidor/i);
});
