const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { readJsonSafe, writeJsonAtomic, deepMerge } = require('../jsonStore');

test('readJsonSafe returns empty object for invalid JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcobot-json-'));
  const file = path.join(dir, 'bad.json');
  fs.writeFileSync(file, '{invalid', 'utf8');

  assert.deepEqual(readJsonSafe(file), {});
});

test('writeJsonAtomic writes JSON successfully', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcobot-json-'));
  const file = path.join(dir, 'store.json');

  writeJsonAtomic(file, { ok: true, count: 2 });
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));

  assert.deepEqual(parsed, { ok: true, count: 2 });
});

test('deepMerge keeps nested data consistent', () => {
  const merged = deepMerge({ config: { a: 1, nested: { x: 1 } } }, { config: { b: 2, nested: { y: 2 } } });

  assert.deepEqual(merged, {
    config: {
      a: 1,
      b: 2,
      nested: { x: 1, y: 2 }
    }
  });
});
