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

const app = express();

app.use(cors());
app.use(express.json());
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
  console.log(`  Dokumente: ${config.docsDir}`);

  // Initialize database (clone/pull or init local)
  await initDatabase();

  // Start periodic git commit + push (every 5 minutes)
  startAutoSync();

  app.listen(config.port, () => {
    console.log(`\n  MCM Server läuft auf http://localhost:${config.port}\n`);
  });
}

start().catch(err => {
  console.error('Startup-Fehler:', err);
  process.exit(1);
});

// Graceful shutdown on SIGTERM (pod eviction, docker stop, k8s rolling update)
async function shutdown(signal) {
  console.log(`\n  [${signal}] Graceful shutdown – finaler git commit+push …`);
  try {
    const result = await gitCommitAndPush();
    if (result.committed) console.log(`  [shutdown] ${result.message}${result.pushed ? ' + push' : ''}`);
    else console.log('  [shutdown] Keine offenen Änderungen.');
  } catch (e) {
    console.error('  [shutdown] git flush error:', e.message);
  }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
