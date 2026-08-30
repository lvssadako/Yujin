const test = require('node:test');
const assert = require('node:assert/strict');

const { 
  COLORS, 
  createSuccessEmbed, 
  createErrorEmbed, 
  createInfoEmbed, 
  createWarningEmbed,
  createBoostEmbed,
  createLevelEmbed 
} = require('../utils/embedFactory');

test('COLORS object contains standard colors', () => {
  assert.equal(typeof COLORS.success, 'number');
  assert.equal(typeof COLORS.error, 'number');
  assert.equal(typeof COLORS.info, 'number');
  assert.equal(typeof COLORS.boost, 'number');
});

test('createSuccessEmbed creates embed with success color', () => {
  const embed = createSuccessEmbed('Test', 'This is a test');
  assert.equal(embed.data.color, COLORS.success);
  assert.equal(embed.data.title, 'Test');
  assert.equal(embed.data.description, 'This is a test');
});

test('createErrorEmbed creates embed with error color', () => {
  const embed = createErrorEmbed('Error', 'Something failed');
  assert.equal(embed.data.color, COLORS.error);
  assert.equal(embed.data.title, 'Error');
});

test('createBoostEmbed includes author when user provided', () => {
  const mockUser = {
    username: 'TestUser',
    displayAvatarURL: () => 'https://example.com/avatar.png'
  };
  const embed = createBoostEmbed(mockUser, 'Boost notification');
  assert.equal(embed.data.author?.name, 'TestUser');
  assert.equal(embed.data.color, COLORS.boost);
});

test('createLevelEmbed creates level-up embed with correct color', () => {
  const embed = createLevelEmbed(null, 10, 'Level up!');
  assert.equal(embed.data.color, COLORS.level);
  assert.equal(embed.data.description, 'Level up!');
});
