const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const webhookService = require('../githubWebhookService');

describe('GitHub Webhook Service', () => {
  let server;
  const TEST_PORT = 38472;
  const TEST_SECRET = 'my_test_secret_123';
  const TEST_BRANCH = 'refactor/structure';

  before(async () => {
    process.env.PORT = String(TEST_PORT);
    process.env.GITHUB_WEBHOOK_SECRET = TEST_SECRET;
    process.env.GITHUB_BRANCH = TEST_BRANCH;

    const mockClient = {
      commands: new Map(),
      prefixCommands: new Map()
    };

    server = webhookService.init(mockClient, {
      port: TEST_PORT,
      secret: TEST_SECRET,
      branch: TEST_BRANCH
    });

    await new Promise(r => setTimeout(r, 50));
  });

  after(async () => {
    if (server && server.close) {
      await new Promise(r => server.close(r));
    }
  });

  function makeRequest(options, body = '') {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          ...options
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            let parsed;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
            resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
          });
        }
      );

      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  function signPayload(payloadString, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    return `sha256=${hmac.update(payloadString).digest('hex')}`;
  }

  it('GET /health debe responder 200 con estado online', async () => {
    const res = await makeRequest({ path: '/health', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'online');
    assert.strictEqual(res.body.branch, TEST_BRANCH);
  });

  it('GET / (con trailing slash) debe responder 200', async () => {
    const res = await makeRequest({ path: '/', method: 'GET' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'online');
  });

  it('OPTIONS /webhook debe responder 204 con cabeceras CORS', async () => {
    const res = await makeRequest({ path: '/webhook', method: 'OPTIONS' });
    assert.strictEqual(res.statusCode, 204);
  });

  it('POST sin firma válida debe responder 401', async () => {
    const body = JSON.stringify({ zen: 'Mind over matter' });
    const res = await makeRequest(
      {
        path: '/api/github-webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
          'X-Hub-Signature-256': 'sha256=invalidhex12345678901234567890123456789012345678901234567890123456'
        }
      },
      body
    );
    assert.strictEqual(res.statusCode, 401);
  });

  it('POST /webhook evento ping con firma válida debe responder 200', async () => {
    const body = JSON.stringify({ zen: 'Mind over matter' });
    const signature = signPayload(body, TEST_SECRET);
    const res = await makeRequest(
      {
        path: '/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
          'X-Hub-Signature-256': signature
        }
      },
      body
    );
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.status, 'ready');
  });

  it('POST /api/webhook/ (con trailing slash) debe ser aceptado', async () => {
    const body = JSON.stringify({ zen: 'Mind over matter' });
    const signature = signPayload(body, TEST_SECRET);
    const res = await makeRequest(
      {
        path: '/api/webhook/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Event': 'ping',
          'X-Hub-Signature-256': signature
        }
      },
      body
    );
    assert.strictEqual(res.statusCode, 200);
  });

  it('GET a ruta desconocida debe devolver 404 con rutas válidas sugeridas', async () => {
    const res = await makeRequest({ path: '/ruta-desconocida', method: 'GET' });
    assert.strictEqual(res.statusCode, 404);
    assert(Array.isArray(res.body.validWebhookPaths));
  });
});
