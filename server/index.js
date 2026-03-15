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
const { initDatabase, startAutoSync, gitCommitAndPush, readUser, isDemoMode } = require('./lib/gitdb');
const logger = require('./lib/logger');

const app = express();

app.use(cors({ origin: config.corsOrigin || false }));
app.use(express.json());
app.use(logger.requestMiddleware());
app.use(express.static(path.join(__dirname, '../client')));

// Public routes
app.use('/api/auth', authRoutes);
// Public registration: rewrite URL so requestsRouter matches /register
app.post('/api/auth/register', (req, res, next) => { req.url = '/register'; requestsRoutes(req, res, next); });

// GET /api/status – public, used by SPA to detect demo mode
app.get('/api/status', (_req, res) => res.json({ demoMode: isDemoMode() }));

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
    res.json(u);
  } catch {
    res.json({ kuerzel: req.user.kuerzel, name: req.user.name, vorname: req.user.vorname, chapters: [] });
  }
});

// POST /api/sync – manual git commit + push (orgaAdmin only)
app.post('/api/sync', authMiddleware, async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins' });
  const result = await gitCommitAndPush();
  res.json(result);
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

  // Initialize database (clone/pull or init local)
  await initDatabase();

  // Start periodic git commit + push (every 5 minutes)
  startAutoSync();

  app.listen(config.port, () => {
    logger.info('startup.listen', { port: config.port, demoMode: isDemoMode() });
  });
}

start().catch(err => {
  logger.error('startup.error', { err: err.message });
  process.exit(1);
});

// Graceful shutdown on SIGTERM (pod eviction, docker stop, k8s rolling update)
async function shutdown(signal) {
  logger.info('shutdown', { signal });
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
