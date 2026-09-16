const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const imageFile = path.resolve(__dirname, '../imageService.js');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13]);
const PUBLIC = { address: '93.184.216.34', family: 4 };

// Every network and storage dependency is controlled. Never import the real
// logger (writes logs) or read/write the operational backgrounds directory.
function fixture({ answers = [PUBLIC], lookup, replies = [{}], stall = false } = {}) {
  const files = new Map();
  const calls = [];
  const dnsCalls = [];
  const requests = [];
  const responses = [];
  const timers = new Map();
  let nextTimer = 0;
  const memoryFs = {
    existsSync: file => files.has(file), mkdirSync() {},
    promises: {
      readFile: async file => files.get(file),
      writeFile: async (file, data) => files.set(file, Buffer.from(data)),
      unlink: async file => files.delete(file),
    },
  };
  function request(url, options, callback) {
    calls.push({ url: url.toString(), options });
    const req = new EventEmitter();
    req.destroy = () => { req.destroyed = true; };
    req.end = () => queueMicrotask(() => {
      if (req.destroyed || stall) return;
      const reply = replies[calls.length - 1] || {};
      if (reply.error) { req.emit('error', reply.error); return; }
      const res = new EventEmitter();
      res.statusCode = reply.status || 200;
      res.headers = reply.headers || {};
      res.destroy = () => { res.destroyed = true; };
      responses.push(res);
      callback(res);
      if (reply.hang) return;
      for (const chunk of reply.chunks || [PNG]) {
        if (!res.destroyed) res.emit('data', chunk);
      }
      if (!res.destroyed) res.emit(reply.abort ? 'aborted' : 'end');
    });
    requests.push(req);
    return req;
  }
  const actualRequire = createRequire(imageFile);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(imageFile, 'utf8'), {
    module, __dirname: path.dirname(imageFile), Buffer, URL, AbortController,
    setTimeout(fn, ms) { const id = ++nextTimer; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(id) {
      if (id === 'fs') return memoryFs;
      if (id === '../../utils/logger') return { info() {}, warn() {}, error() {} };
      if (id === 'node:dns') return { promises: { lookup: async (...args) => {
        dnsCalls.push(args);
        return lookup ? lookup(...args) : answers;
      } } };
      if (id === 'node:http' || id === 'node:https') return { request };
      if (['path', 'node:net', '../../utils/urlSafety'].includes(id)) return actualRequire(id);
      throw new Error(`Unexpected dependency: ${id}`);
    },
  }, { filename: imageFile });
  return { ...module.exports, calls, dnsCalls, requests, responses, files, timers,
    expire() { for (const { fn } of [...timers.values()]) fn(); },
  };
}

const { detectImageMime } = fixture();

test('detectImageMime correctly identifies valid image formats', () => {
  // PNG
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  assert.equal(detectImageMime(pngHeader), 'image/png');

  // JPEG
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(detectImageMime(jpegHeader), 'image/jpeg');

  // WebP
  const webpHeader = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from('WEBP', 'ascii')
  ]);
  assert.equal(detectImageMime(webpHeader), 'image/webp');

  // GIF
  const gifHeader = Buffer.from('GIF89a123456', 'ascii');
  assert.equal(detectImageMime(gifHeader), 'image/gif');

  // Non-image text
  const textHeader = Buffer.from('<!DOCTYPE html><html>', 'utf8');
  assert.equal(detectImageMime(textHeader), null);
});

test('profile and streak cache use isolated storage and secure download fallback', async () => {
  const f = fixture();
  const guildId = 'test_guild_999';
  const userId = 'test_user_999';
  for (const kind of ['Profile', 'Streak']) {
    assert.equal((await f[`saveUser${kind}Background`](guildId, userId, 'https://example.com/bg.png')).ok, true);
    const before = f.calls.length;
    assert.deepEqual(await f[`getUser${kind}BackgroundBuffer`](guildId, userId), PNG);
    assert.equal(f.calls.length, before);
    await f[`deleteUser${kind}Background`](guildId, userId);
    assert.equal(await f[`getUser${kind}BackgroundBuffer`](guildId, userId), null);
    assert.equal(await f[`getUser${kind}BackgroundBuffer`](guildId, userId, 'http://127.0.0.1/x.png'), null);
    assert.equal(f.files.size, 0);
    assert.deepEqual(await f[`getUser${kind}BackgroundBuffer`](guildId, userId, 'https://example.com/bg.png'), PNG);
    await f[`deleteUser${kind}Background`](guildId, userId);
  }
});

test('DNS answers must all be public; errors, empty or malformed answers fail closed', async () => {
  for (const answers of [[], [{ address: '127.0.0.1', family: 4 }],
    [PUBLIC, { address: '10.0.0.1', family: 4 }],
    [{ address: '::ffff:8.8.8.8', family: 6 }],
    [{ address: 'fe80::1', family: 6 }], [{ address: '224.0.0.1', family: 4 }],
    [{ address: '169.254.169.254', family: 4 }], [{ ...PUBLIC, family: 6 }],
    [{ address: 'not-an-ip', family: 4 }]]) {
    const f = fixture({ answers });
    assert.equal((await f.fetchAndValidateImage('https://images.unsplash.com/photo-test')).ok, false);
    assert.equal(f.calls.length, 0);
    assert.equal(f.timers.size, 0);
  }
  const f = fixture({ lookup: () => { throw new Error('DNS failure'); } });
  assert.equal(await f.fetchImageBuffer('https://example.com/x.png'), null);
  assert.equal(f.calls.length, 0);
});

test('connection lookup is pinned to validated IPv4/IPv6, preserving Host and TLS hostname', async () => {
  for (const address of [PUBLIC, { address: '2606:4700:4700::1111', family: 6 }]) {
    const f = fixture({ lookup: () => f.dnsCalls.length === 1 ? [address] : [{ address: '127.0.0.1', family: 4 }] });
    const url = 'https://cdn.discordapp.com/attachments/1/2/a.png?ex=123&hm=abc';
    assert.equal((await f.fetchAndValidateImage(url)).ok, true);
    const call = f.calls[0];
    assert.equal(call.url, url);
    assert.equal(call.options.agent, false);
    assert.equal(call.options.family, address.family);
    assert.equal(call.options.autoSelectFamily, false);
    assert.equal(call.options.rejectUnauthorized, undefined); // TLS defaults stay enabled.
    for (let i = 0; i < 2; i++) {
      call.options.lookup('cdn.discordapp.com', {}, (err, ip, family) => {
        assert.equal(err, null); assert.equal(ip, address.address); assert.equal(family, address.family);
      });
    }
    call.options.lookup('cdn.discordapp.com', { all: true }, (err, records) => {
      assert.equal(err, null); assert.equal(records[0].address, address.address);
    });
    assert.equal(f.dnsCalls.length, 1);
    assert.equal(f.dnsCalls[0][1].all, true);
    assert.equal(f.requests[0].destroyed, true);
  }
});

test('public literal addresses connect without DNS; dangerous literals never connect', async () => {
  for (const host of ['8.8.8.8', '[2606:4700:4700::1111]']) {
    const f = fixture();
    assert.equal((await f.fetchAndValidateImage(`https://${host}/x.png`)).ok, true);
    assert.equal(f.dnsCalls.length, 0);
  }
  for (const host of ['127.1', '2130706433', '[::ffff:a9fe:a9fe]', 'metadata.google.internal']) {
    const f = fixture();
    assert.equal(await f.fetchImageBuffer(`http://${host}/x.png`), null);
    assert.equal(f.calls.length, 0);
    assert.equal(f.dnsCalls.length, 0);
  }
});

test('all supported redirects revalidate destinations before connecting', async () => {
  for (const status of [301, 302, 303, 307, 308]) {
    for (const location of ['http://169.254.169.254/latest', '//127.0.0.1/a.png',
      'http://[::ffff:127.0.0.1]/a.png', 'file:///a.png', 'https://u:p@example.com/a.png',
      'https://private.example.com/a.png']) {
      const f = fixture({ replies: [{ status, headers: { location } }],
        lookup: host => host === 'private.example.com' ? [{ address: '192.168.1.1', family: 4 }] : [PUBLIC] });
      assert.equal((await f.fetchAndValidateImage('https://example.com/a.png')).ok, false, location);
      assert.equal(f.calls.length, 1);
      assert.equal(f.responses[0].destroyed, true);
    }
  }
});

test('relative and public CDN redirects preserve queries and validate DNS on each hop', async () => {
  const f = fixture({ replies: [
    { status: 302, headers: { location: '/new?sig=abc' } },
    { status: 307, headers: { location: 'https://images.unsplash.com/photo-1?w=100' } }, {},
  ] });
  assert.equal((await f.fetchAndValidateImage('https://example.com/x.png')).ok, true);
  assert.equal(f.calls[1].url, 'https://example.com/new?sig=abc');
  assert.equal(f.calls[2].url, 'https://images.unsplash.com/photo-1?w=100');
  assert.equal(f.dnsCalls.length, 3);
  const rebound = fixture({ replies: [{ status: 302, headers: { location: '/new.png' } }],
    lookup: () => rebound.dnsCalls.length === 1 ? [PUBLIC] : [{ address: '10.0.0.1', family: 4 }] });
  assert.equal(await rebound.fetchImageBuffer('https://example.com/x.png'), null);
  assert.equal(rebound.calls.length, 1);
});

test('redirect loops and missing Location terminate with sockets closed', async () => {
  for (const headers of [{}, { location: '/x.png' }]) {
    const f = fixture({ replies: Array(7).fill({ status: 302, headers }) });
    assert.equal((await f.fetchAndValidateImage('https://example.com/x.png')).ok, false);
    assert.equal(f.calls.length, headers.location ? 6 : 1);
    assert.ok(f.responses.every(res => res.destroyed));
  }
});

test('size limits cancel declared, chunked and dishonest oversized responses', async () => {
  for (const reply of [
    { headers: { 'content-length': '13' } },
    { chunks: [PNG, Buffer.from('x'), Buffer.alloc(1000)] },
    { headers: { 'content-length': '1' }, chunks: [PNG, Buffer.from('x')] },
  ]) {
    const f = fixture({ replies: [reply] });
    const result = await f.fetchAndValidateImage('https://example.com/x.png', 12);
    assert.equal(result.ok, false);
    assert.match(result.error, /tamaño máximo/);
    assert.equal(f.responses[0].destroyed, true);
    assert.equal(f.requests[0].destroyed, true);
  }
  const f = fixture();
  assert.equal((await f.fetchAndValidateImage('https://example.com/x.png', PNG.length)).ok, true);
  for (const size of [NaN, 0, -1, Infinity, 10 * 1024 * 1024 + 1]) {
    assert.equal((await f.fetchAndValidateImage('https://example.com/x.png', size)).ok, false);
  }
});

test('empty, invalid, compressed, failed and interrupted responses fail safely', async () => {
  for (const reply of [{ chunks: [] }, { chunks: [Buffer.from('<html>not an image</html>')] },
    { headers: { 'content-encoding': 'gzip' } }, { status: 404 }, { abort: true },
    { error: new Error('socket failed') }]) {
    const f = fixture({ replies: [reply] });
    assert.equal((await f.fetchAndValidateImage('https://example.com/x.png')).ok, false);
    assert.ok(f.requests.every(req => req.destroyed));
  }
});

test('one total deadline covers DNS, headers, body and redirects; late DNS cannot connect', async () => {
  for (const mode of ['dns', 'headers', 'body', 'redirect']) {
    let resolveDns;
    const f = fixture({
      lookup: mode === 'dns' ? () => new Promise(resolve => { resolveDns = resolve; }) : undefined,
      stall: mode === 'headers',
      replies: mode === 'redirect' ? [{ status: 302, headers: { location: '/next' } }, { hang: true }] : [{ hang: true }],
    });
    const pending = f.fetchAndValidateImage('https://example.com/x.png');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.timers.size, 1);
    assert.equal([...f.timers.values()][0].ms, 10000);
    f.expire();
    assert.match((await pending).error, /Tiempo de espera/);
    if (resolveDns) resolveDns([PUBLIC]);
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(f.requests.every(req => req.destroyed));
    assert.ok(f.responses.every(res => res.destroyed));
    if (mode === 'dns') assert.equal(f.calls.length, 0);
    assert.equal(f.timers.size, 0);
  }
});

test('renderer contract allows extensionless images and SVG with the same network checks', async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  const f = fixture({ replies: [{ chunks: [svg] }] });
  const pending = f.fetchImageBuffer('https://example.com/icon?signature=abc', { timeoutMs: 6000 });
  assert.equal([...f.timers.values()][0].ms, 6000);
  assert.deepEqual(await pending, svg);
  assert.equal(f.calls[0].url, 'https://example.com/icon?signature=abc');
});

test('profile, streak, leaderboard and both level commands route images through the secure service', async () => {
  const project = path.resolve(__dirname, '../../../..');
  for (const [relative, helper] of [
    ['src/commands/profile/profile.js', 'fetchBuffer'],
    ['src/services/streak/streakCard.js', 'fetchAvatarBuffer'],
    ['src/commands/level/leaderboard.js', 'fetchAvatarBuffer'],
    ['src/commands/level/level.js', 'fetchAvatarBuffer'],
    ['src/prefixCommands/level.js', 'fetchAvatarBuffer'],
  ]) {
    const file = path.join(project, relative);
    const source = fs.readFileSync(file, 'utf8');
    const f = fixture();
    const module = { exports: {} };
    const builder = new Proxy({}, { get: () => () => builder });
    const scope = { module, __dirname: path.dirname(file), Buffer,
      require(id) {
        if (id.endsWith('/imageService')) return f;
        if (id.endsWith('/urlSafety')) return require('../../../utils/urlSafety');
        if (id.endsWith('/level')) return { levelService: {} };
        if (id.endsWith('/canvasFontLoader')) return { initFonts() {} };
        if (id === 'path') return path;
        if (id === 'discord.js') return { SlashCommandBuilder: function () { return builder; } };
        if (id === '@napi-rs/canvas') return { loadImage() { assert.fail('Unprotected Canvas fetch'); } };
        if (id === 'fs') return { existsSync() { return false; } };
        return {};
      },
    };
    vm.runInNewContext(`${source}\nmodule.exports.testDownload = ${helper};` +
      (helper === 'fetchBuffer' ? '\nmodule.exports.testBadge = resolveBadgeIcon;' : ''), scope, { filename: file });
    assert.deepEqual(await module.exports.testDownload('https://cdn.discordapp.com/avatars/1/a.png'), PNG, relative);
    assert.equal(await module.exports.testDownload('http://169.254.169.254/x.png'), null, relative);
    assert.equal(f.calls.length, 1, relative);
    if (module.exports.testBadge) {
      assert.equal(await module.exports.testBadge('http://127.0.0.1/x.png'), null);
    }
    assert.doesNotMatch(source, /(?<!\.)\bfetch\s*\(/, relative);
    assert.doesNotMatch(source, /loadImage\((?:url|str|avUrl)\)/, relative);
  }
});
