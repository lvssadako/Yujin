const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const querystring = require('node:querystring');
const { execFile } = require('node:child_process');
const { createDeliveryStore } = require('./deliveryStore');

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024;
const WEBHOOK_PATHS = new Set(['/webhook', '/api/webhook', '/api/github-webhook', '/github-webhook']);
const HEALTH_PATHS = new Set(['/', '/health', '/status', '/api/health', '/healthcheck']);
let server = null;

function verifySignature(secret, signature, rawBody) {
  if (typeof secret !== 'string' || !secret.trim() || typeof signature !== 'string' ||
      !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), expected);
}

function executeGitPull(branch = 'refactor/structure') {
  if (typeof branch !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) {
    return Promise.reject(new Error('Invalid deployment branch'));
  }
  return new Promise((resolve, reject) => {
    execFile('git', ['pull', 'origin', branch], {
      cwd: path.join(__dirname, '..', '..', '..'), timeout: 120000, maxBuffer: 1024 * 1024
    }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

async function deployAndReload(client, branch) {
  await executeGitPull(branch);
  if (client) require('../../loaders/commandLoader').reloadCommandRegistry(client);
}

// Independent server factory: tests inject both state and the entire deployment.
function createWebhookServer(options) {
  const { secret, branch = 'refactor/structure', repository, store, deploy, logger = { error() {} },
    maxPayloadBytes = MAX_PAYLOAD_BYTES } = options;
  if (!store || typeof deploy !== 'function') throw new Error('Missing webhook dependencies');
  let activeJob = Promise.resolve();
  const respond = (res, status, payload) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(payload));
  };
  const instance = http.createServer((req, res) => {
    const route = (req.url.split('?')[0] || '/').toLowerCase().replace(/\/+$/, '') || '/';
    req.on('error', () => {});
    if ((req.method === 'GET' || req.method === 'HEAD') && (HEALTH_PATHS.has(route) || WEBHOOK_PATHS.has(route))) {
      return respond(res, 200, { status: 'online' });
    }
    if (req.method === 'OPTIONS' && WEBHOOK_PATHS.has(route)) return respond(res, 204, {});
    if (req.method !== 'POST' || !WEBHOOK_PATHS.has(route)) return respond(res, 404, { error: 'Not found' });
    if (typeof secret !== 'string' || !secret.trim()) {
      req.resume();
      return respond(res, 503, { error: 'Deployment unavailable' });
    }
    const chunks = [];
    let bytes = 0;
    let exceeded = false;
    req.on('data', chunk => {
      if (exceeded) return;
      bytes += chunk.length;
      if (bytes > maxPayloadBytes) {
        exceeded = true;
        chunks.length = 0;
        return respond(res, 413, { error: 'Payload too large' });
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) return;
      const body = Buffer.concat(chunks);
      if (!verifySignature(secret, req.headers['x-hub-signature-256'], body)) {
        return respond(res, 401, { error: 'Unauthorized signature' });
      }
      const event = req.headers['x-github-event'];
      if (event === 'ping') return respond(res, 200, { status: 'ready' });
      if (event !== 'push') return respond(res, 200, { status: 'ignored' });
      const delivery = req.headers['x-github-delivery'];
      if (typeof delivery !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(delivery)) {
        return respond(res, 400, { error: 'Invalid delivery ID' });
      }
      let payload;
      try {
        const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (contentType === 'application/x-www-form-urlencoded') {
          const form = querystring.parse(body.toString('utf8'));
          if (typeof form.payload !== 'string') throw new Error('Missing payload');
          payload = JSON.parse(form.payload);
        } else if (contentType === 'application/json') {
          payload = JSON.parse(body.toString('utf8'));
        } else return respond(res, 415, { error: 'Unsupported content type' });
        if (!payload || Array.isArray(payload) || typeof payload.ref !== 'string') throw new Error('Invalid payload');
      } catch { return respond(res, 400, { error: 'Invalid payload' }); }
      if (repository && payload.repository?.full_name !== repository) return respond(res, 403, { error: 'Repository not allowed' });
      if (payload.ref !== `refs/heads/${branch}` || payload.deleted === true) return respond(res, 200, { status: 'ignored' });
      let reservation;
      try {
        reservation = store.reserve(delivery, crypto.createHash('sha256').update(body).digest('hex'));
      } catch {
        logger.error('[GitHub Webhook] Deployment state unavailable; operator review required.');
        return respond(res, 503, { error: 'Deployment unavailable' });
      }
      if (reservation.status === 'duplicate') return respond(res, 200, { status: 'duplicate' });
      if (reservation.status !== 'accepted') {
        res.setHeader('Retry-After', '60');
        return respond(res, 503, { error: 'Deployment busy or requires review' });
      }
      // Persisted reservation already exists. 202 means accepted, never success.
      activeJob = Promise.resolve().then(async () => {
        let outcome = 'completed';
        try { await deploy(branch); }
        catch {
          outcome = 'failed';
          logger.error('[GitHub Webhook] Deployment failed; operator review required before further deployments.');
        }
        try { reservation.finish(outcome); }
        catch { logger.error('[GitHub Webhook] Completion could not be persisted; operator review required.'); }
      });
      respond(res, 202, { status: 'accepted' });
    });
  });
  instance.requestTimeout = 15000;
  instance.headersTimeout = 10000;
  instance.waitForIdle = () => activeJob;
  return instance;
}

function init(client, options = {}) {
  if (server) return server;
  const logger = options.logger || require('../../utils/logger');
  const port = Number(options.port ?? process.env.PORT ?? process.env.WEBHOOK_PORT ?? 3000);
  const branch = options.branch ?? process.env.GITHUB_BRANCH ?? 'refactor/structure';
  server = createWebhookServer({
    secret: options.secret ?? process.env.GITHUB_WEBHOOK_SECRET ?? '',
    branch,
    repository: options.repository ?? process.env.GITHUB_REPOSITORY,
    store: options.store || createDeliveryStore(options.stateDir || path.join(__dirname, '..', '..', '..', 'data', 'webhook')),
    deploy: options.deploy || (target => deployAndReload(client, target)),
    logger
  });
  const current = server;
  current.once('close', () => { if (server === current) server = null; });
  current.listen(port, options.host || '0.0.0.0');
  return current;
}

module.exports = { init, createWebhookServer, verifySignature, executeGitPull };
