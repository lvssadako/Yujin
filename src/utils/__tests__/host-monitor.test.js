const test = require('node:test');
const assert = require('node:assert/strict');
const { getHostMetrics, formatBytes, formatDuration, makeProgressBar } = require('../hostMonitor');

test('hostMonitor: helper formatting functions', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.00 KB');
  assert.equal(formatBytes(1024 * 1024), '1.00 MB');

  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(65), '1m 5s');
  assert.equal(formatDuration(3665), '1h 1m 5s');

  const bar = makeProgressBar(50, 10);
  assert.ok(bar.includes('50.0%'));
  assert.ok(bar.includes('█████░░░░░'));
});

test('hostMonitor: getHostMetrics retrieves valid system metrics', () => {
  const fakeClient = { ws: { ping: 42 } };
  const metrics = getHostMetrics(fakeClient);

  assert.ok(metrics.cpu.cores > 0);
  assert.ok(metrics.memory.total > 0);
  assert.ok(metrics.memory.percent >= 0 && metrics.memory.percent <= 100);
  assert.ok(metrics.os.platform.length > 0);
  assert.equal(metrics.network.wsPing, 42);
});
