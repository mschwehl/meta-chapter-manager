const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const config = require('./config');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const eventsRoutes = require('./routes/events');
const verifyRoutes = require('./routes/verify');
const adminRoutes = require('./routes/admin');
const chaptersRoutes = require('./routes/chapters');
const orgaRoutes = require('./routes/orga');
const docsRoutes = require('./routes/docs');
const requestsRoutes = require('./routes/requests');
const { authMiddleware } = require('./middleware/auth');
const { initDatabase, startAutoSync, stopAutoSync, gitCommitAndPush, getPendingPushCount, getEffectiveSyncStrategy, readUser, readOrganisation, startGitWatchdog, stopGitWatchdog } = require('./lib/gitdb');
const sse = require('./lib/sse');
const { version: APP_VERSION } = require('./package.json');
const logger = require('./lib/logger');
const jwt = require('jsonwebtoken');
const swaggerUiDist = require('swagger-ui-dist');

const rateLimit = require('express-rate-limit');

const app = express();
const OPENAPI_SPEC_FILE = path.join(__dirname, '../spec/openapi.yaml');
const OPENAPI_UI_DIST_DIR = swaggerUiDist.getAbsoluteFSPath();

app.use(cors({ origin: config.corsOrigin || false }));
app.use(express.json({ limit: '100kb' }));
app.use(logger.requestMiddleware());

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(path.join(__dirname, '../client')));

// Redirect /favicon.ico to /favicon.svg
app.get('/favicon.ico', (req, res) => res.redirect(301, '/favicon.svg'));

// Public routes
app.use('/api/auth', authRoutes);
// Public registration: rate-limited, rewrite URL so requestsRouter matches /register
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Zu viele Registrierungsversuche. Bitte später erneut versuchen.' } });
app.get('/api/auth/register/options', (req, res, next) => { req.url = '/register/options'; requestsRoutes(req, res, next); });
app.post('/api/auth/register', registerLimiter, (req, res, next) => { req.url = '/register'; requestsRoutes(req, res, next); });

// GET /api/status – public, used by SPA to detect demo mode + branding
app.get('/api/status', async (_req, res) => {
  let orgName = null;
  try { const org = await readOrganisation(); orgName = org.name || null; } catch { /* db may not be ready yet */ }
  res.json({ orgName, version: APP_VERSION });
});

// Public local Swagger UI static assets (offline-friendly)
app.use('/api/openapi-assets', express.static(OPENAPI_UI_DIST_DIR));

// GET /api/openapi.yaml – public OpenAPI document
app.get('/api/openapi.yaml', (req, res) => {
  res.type('application/yaml');
  res.sendFile(OPENAPI_SPEC_FILE, err => {
    if (err && !res.headersSent) res.status(404).json({ error: 'OpenAPI specification not found' });
  });
});

// GET /api/openapi – public Swagger UI (local assets)
app.get('/api/openapi', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MetaChapterManager OpenAPI</title>
  <link rel="stylesheet" href="/api/openapi-assets/swagger-ui.css" />
  <style>
    html, body { margin: 0; padding: 0; }
    body { background: #f6f8fb; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/openapi-assets/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      docExpansion: 'none'
    });
  </script>
</body>
</html>`);
});

// GET /api/sse – Server-Sent Events stream (token via query param)
app.get('/api/sse', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const { getRevokedAt } = require('./lib/gitdb');
    const revokedAt = getRevokedAt(payload.kuerzel);
    if (revokedAt && payload.iat * 1000 < revokedAt) return res.status(401).end();
  } catch { return res.status(401).end(); }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n'); // initial comment to flush
  sse.addClient(res);

  // Keep-alive every 30s
  const keepAlive = setInterval(() => { try { res.write(':\n\n'); } catch { clearInterval(keepAlive); } }, 30000);
  res.on('close', () => clearInterval(keepAlive));
});

// Protected routes (JWT required)
app.use('/api/users', authMiddleware, usersRoutes);
app.use('/api/events', authMiddleware, eventsRoutes);
app.use('/api/verify', authMiddleware, verifyRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/admin/requests', authMiddleware, requestsRoutes);
app.use('/api/chapters', authMiddleware, chaptersRoutes);
app.use('/api/orga', authMiddleware, orgaRoutes);
app.use('/api/docs', authMiddleware, docsRoutes);

// GET /api/users/me – own profile (read-only, any authenticated user)
// Note: this is defined here so it doesn't conflict with /api/users/:kuerzel
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const u = await readUser(req.user.kuerzel);
    // Merge JWT-derived flags so the client keeps orgaAdmin / zeitstelle / roles
    res.json({ ...u, orgaAdmin: req.user.orgaAdmin || false, zeitstelle: req.user.zeitstelle || false, roles: req.user.roles || {} });
  } catch {
    res.json({ kuerzel: req.user.kuerzel, name: req.user.name, vorname: req.user.vorname, orgeinheit: req.user.orgeinheit || '', chapters: [], orgaAdmin: req.user.orgaAdmin || false, zeitstelle: req.user.zeitstelle || false, roles: req.user.roles || {} });
  }
});

// POST /api/sync – manual git commit + push (orgaAdmin only)
app.get('/api/sync/status', authMiddleware, async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins' });
  const [syncStrategy, pending] = await Promise.all([
    getEffectiveSyncStrategy(),
    getPendingPushCount(),
  ]);
  res.json({ syncStrategy, pendingPushCount: pending.pendingPushCount || 0 });
});

// POST /api/sync – manual git commit + push (orgaAdmin only)
app.post('/api/sync', authMiddleware, async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins' });
  const result = await gitCommitAndPush();
  const [syncStrategy, pending] = await Promise.all([
    getEffectiveSyncStrategy(),
    getPendingPushCount(),
  ]);
  res.json({ ...result, syncStrategy, pendingPushCount: pending.pendingPushCount || 0 });
});

// Fallback routes
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/register.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/login.html'));
});
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/app.html'));
});
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/app.html'));
});

async function start() {
  // Ensure docs directory exists (local, not in git)
  await fs.mkdir(config.docsDir, { recursive: true });
  logger.info('startup.docs', { dir: config.docsDir });

  if (process.env.NODE_ENV === 'development') {
    console.log('[DEV MODE] Server starting with NODE_ENV=development');
    logger.info('startup.dev', { msg: 'Running in development mode', port: config.port });
  }

  // Initialize database (clone/pull or init local)
  await initDatabase();

  // Ensure a bootstrap admin / orgAdmin exists on every start (idempotent).
  // Covers fresh git repos and empty data directories.
  const { ensureBootstrapAdmin } = require('./lib/gitdb');
  await ensureBootstrapAdmin();

  // Start periodic git commit + push (every 5 minutes)
  startAutoSync(config.gitAutoSyncIntervalMs);
  // Start git watchdog (checks every 60 s for stuck lock / orphaned processes)
  startGitWatchdog();

  app.listen(config.port, () => {
    logger.info('startup.listen', { port: config.port });
    console.log(`Server started on http://localhost:${config.port}`);
  });
}

start().catch(err => {
  logger.error('startup.error', { err: err.message });
  process.exit(1);
});

// Graceful shutdown on SIGTERM (pod eviction, docker stop, k8s rolling update)
async function shutdown(signal) {
  logger.info('shutdown', { signal });
  stopGitWatchdog();
  stopAutoSync();
  try {
    const result = await gitCommitAndPush();
    logger.info('shutdown.git', { committed: result.committed, pushed: result.pushed });
  } catch (e) {
    logger.error('shutdown.git', { err: e.message });
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Global async error handler — catch unhandled errors in route handlers
app.use((err, _req, res, _next) => {
  logger.error('unhandled_error', { err: err.message, stack: err.stack });
  if (!res.headersSent) res.status(500).json({ error: 'Interner Serverfehler' });
});
