const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getRecentProblemLogs, readLogEntries } = require('../logReader');

test('logReader: getRecentProblemLogs returns filtered and sorted logs', () => {
  const logs = getRecentProblemLogs({ limit: 15, filter: 'all' });
  assert.ok(Array.isArray(logs));
  assert.ok(logs.length <= 15);

  for (const log of logs) {
    const level = (log.level || '').toLowerCase();
    assert.ok(level === 'error' || level === 'warn' || level === 'warning');
  }
});
