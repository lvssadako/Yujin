const http = require('http');
const crypto = require('crypto');
const path = require('path');
const querystring = require('querystring');
const { exec } = require('child_process');
const logger = require('../../utils/logger');
const { reloadCommandRegistry } = require('../../loaders/commandLoader');

let server = null;

function verifySignature(secret, headerSignature, rawBody) {
  if (!secret) return true; // Si no hay secret configurado, omitir validación
  if (!headerSignature) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawBody).digest('hex')}`;

  const sigBuffer = Buffer.from(headerSignature);
  const digestBuffer = Buffer.from(digest);

  if (sigBuffer.length !== digestBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, digestBuffer);
}

function executeGitPull(branch = 'refactor/structure') {
  return new Promise((resolve, reject) => {
    const projectRoot = path.join(__dirname, '..', '..', '..');
    const cmd = `git pull origin ${branch}`;

    logger.info(`[GitHub Webhook] Ejecutando: ${cmd}`);
    exec(cmd, { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        logger.error('[GitHub Webhook] Error en git pull:', { error: error.message, stderr });
        return reject(error);
      }
      logger.info(`[GitHub Webhook] Git pull completado:\n${stdout.trim()}`);
      resolve(stdout);
    });
  });
}

function init(client, options = {}) {
  if (server) return server;

  // Azure App Service asigna automáticamente process.env.PORT (usualmente 80 o 8080)
  const PORT = process.env.PORT || process.env.WEBHOOK_PORT || options.port || 3000;
  const SECRET = process.env.GITHUB_WEBHOOK_SECRET || options.secret || '';
  const TARGET_BRANCH = process.env.GITHUB_BRANCH || options.branch || 'refactor/structure';

  const WEBHOOK_PATHS = new Set(['/webhook', '/api/webhook', '/api/github-webhook', '/github-webhook']);
  const HEALTH_PATHS = new Set(['/', '/health', '/status', '/api/health', '/healthcheck']);

  server = http.createServer(async (req, res) => {
    // Manejo de errores de conexión en el socket
    req.on('error', (err) => {
      logger.error('[GitHub Webhook] Error en el socket de la solicitud:', err);
    });

    const parsedPath = (req.url.split('?')[0] || '/').toLowerCase().replace(/\/+$/, '') || '/';

    // CORS pre-flight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, X-GitHub-Event, X-Hub-Signature-256',
        'Access-Control-Max-Age': '86400'
      });
      return res.end();
    }

    // 1. Healthcheck y verificación de estado en navegador (GET/HEAD)
    if ((req.method === 'GET' || req.method === 'HEAD') && (HEALTH_PATHS.has(parsedPath) || WEBHOOK_PATHS.has(parsedPath))) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      if (req.method === 'HEAD') return res.end();
      return res.end(JSON.stringify({
        status: 'online',
        service: 'Yujin Bot - GitHub Webhook Receiver',
        path: parsedPath,
        branch: TARGET_BRANCH,
        secretConfigured: Boolean(SECRET),
        uptime: process.uptime(),
        message: WEBHOOK_PATHS.has(parsedPath)
          ? 'Endpoint de Webhook activo. Esperando eventos POST desde GitHub.'
          : 'Healthcheck OK',
        timestamp: new Date().toISOString()
      }));
    }

    // 2. Receptor de Webhooks de GitHub
    if (req.method === 'POST' && WEBHOOK_PATHS.has(parsedPath)) {
      const githubEvent = req.headers['x-github-event'];
      const signature = req.headers['x-hub-signature-256'];
      const contentType = (req.headers['content-type'] || '').toLowerCase();

      let body = '';
      req.on('data', chunk => {
        body += chunk;
      });

      req.on('end', async () => {
        // Validar firma criptográfica
        if (!verifySignature(SECRET, signature, body)) {
          logger.warn('[GitHub Webhook] Firma HMAC inválida o ausente recibida desde:', req.socket?.remoteAddress);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Firma no autorizada o secreto incorrecto' }));
        }

        // Si es un ping de prueba de GitHub
        if (githubEvent === 'ping') {
          logger.info('[GitHub Webhook] Evento ping recibido correctamente desde GitHub.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ message: 'Ping recibido con éxito', status: 'ready' }));
        }

        // Si es un push de código
        if (githubEvent === 'push') {
          try {
            let payload;
            if (contentType.includes('application/x-www-form-urlencoded')) {
              const parsedForm = querystring.parse(body);
              payload = typeof parsedForm.payload === 'string' ? JSON.parse(parsedForm.payload) : parsedForm;
            } else {
              payload = JSON.parse(body);
            }

            const ref = payload.ref || '';
            const expectedRef = `refs/heads/${TARGET_BRANCH}`;

            if (ref !== expectedRef) {
              logger.info(`[GitHub Webhook] Push ignorado en rama no monitoreada: ${ref} (Esperada: ${expectedRef})`);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({
                message: `Ignorado. Rama recibida: ${ref}. Monitoreando: ${expectedRef}`
              }));
            }

            const commit = payload.head_commit || (payload.commits && payload.commits[0]) || {};
            const commitMsg = commit.message || 'Sin mensaje';
            const commitAuthor = commit.author?.name || 'GitHub User';

            logger.info(`[GitHub Webhook] 🚀 Push detectado en ${TARGET_BRANCH} por ${commitAuthor}: "${commitMsg}"`);

            // Responder a GitHub inmediatamente para evitar timeout (GitHub requiere respuesta en <10s)
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'success',
              message: 'Despliegue iniciado',
              branch: TARGET_BRANCH,
              commit: commit.id?.slice(0, 7) || 'latest'
            }));

            // Ejecutar git pull
            await executeGitPull(TARGET_BRANCH);

            // Recargar comandos y módulos en caliente
            if (client) {
              const paths = {
                commandsDir: path.join(__dirname, '..', '..', 'commands'),
                sharedDir: path.join(__dirname, '..', '..', 'commands_shared'),
                prefixDir: path.join(__dirname, '..', '..', 'prefixCommands'),
                servicesDir: path.join(__dirname, '..', '..', 'services'),
                constantsDir: path.join(__dirname, '..', '..', 'constants'),
                utilsDir: path.join(__dirname, '..', '..', 'utils')
              };

              const registry = reloadCommandRegistry(client, paths);
              logger.info(`[GitHub Webhook] ✅ Módulos recargados en memoria: ${registry.commands.size} slash, ${registry.prefixCommands.size} prefix.`);
            }

          } catch (err) {
            logger.error('[GitHub Webhook] Error procesando payload de push:', err);
          }
          return;
        }

        // Otros eventos de GitHub (release, workflow_run, etc.)
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: `Evento ${githubEvent || 'desconocido'} recibido sin acción requerida.` }));
      });

      return;
    }

    // Ruta no encontrada o método no soportado
    logger.warn(`[GitHub Webhook] Solicitud no atendida: ${req.method} ${req.url} (normalizado: ${parsedPath})`);
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Endpoint no encontrado',
      receivedPath: parsedPath,
      validWebhookPaths: Array.from(WEBHOOK_PATHS),
      validHealthPaths: Array.from(HEALTH_PATHS)
    }));
  });

  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`🌐 [GitHub Webhook & Health] Servidor escuchando en http://0.0.0.0:${PORT} (Rama: ${TARGET_BRANCH})`);
  });

  return server;
}

module.exports = {
  init,
  verifySignature,
  executeGitPull
};
