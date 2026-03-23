const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const simpleGit = require('simple-git');
const config = require('../config');
const logger = require('./logger');

const sse = require('./sse');

let DB_PATH = config.dataDir;

// Short-lived in-memory cache for credentials.json (used at login / password change).
let _credCache = null;
let _credCacheTs = 0;
const CRED_CACHE_TTL = 10_000; // 10 seconds

// In-memory revocation table: kuerzel → timestamp (ms).
// JWTs issued before this timestamp are rejected by authMiddleware.
// Intentionally NOT persisted to git – keeps the data repo clean.
// After a server restart old tokens remain valid until they expire naturally (8 h).
const _revokedAt = new Map();

// Build a simpleGit instance with the process-kill timeout and SSL config always applied.
// Use this everywhere instead of calling simpleGit() directly so no subprocess can
// ever block indefinitely and leave a dead daemon thread.
function makeGit(optsOverride = {}) {
  const sslConfig = !config.gitSslVerify ? ['http.sslVerify=false'] : [];
  const opts = {
    ...(config.gitTimeoutMs > 0 ? { timeout: { block: config.gitTimeoutMs } } : {}),
    ...optsOverride,
    config: [...sslConfig, ...(optsOverride.config || [])],
  };
  if (opts.config.length === 0) delete opts.config;
  return simpleGit(opts);
}

function getGit() {
  return makeGit({ baseDir: DB_PATH });
}

// Serialise all git operations via a promise chain.
// Prevents concurrent git subprocesses from racing over the lock file and
// accumulating as dead daemon threads when the remote is slow/unreachable.
let _gitChain = Promise.resolve();
let _gitLockAcquiredAt = 0;   // epoch ms when the current op started (0 = idle)
let _gitLockOpsTotal  = 0;   // monotone counter – used by watchdog to detect stuck chain

function withGitLock(fn) {
  const next = _gitChain.then(() => {
    _gitLockAcquiredAt = Date.now();
    _gitLockOpsTotal++;
    return fn();
  }, () => {
    _gitLockAcquiredAt = Date.now();
    _gitLockOpsTotal++;
    return fn();
  }).finally(() => {
    _gitLockAcquiredAt = 0;
  });
  _gitChain = next.catch(() => {});
  return next;
}

// ---------------------------------------------------------------------------
// Git watchdog
// Runs every WATCHDOG_INTERVAL_MS and:
//   1. Warns if the lock chain has been held longer than the kill threshold.
//   2. Removes stale .git/index.lock files left by killed processes.
//   3. On Linux/macOS: kills any orphaned git subprocesses older than the
//      timeout (best-effort, non-fatal on Windows where `pkill` is absent).
// ---------------------------------------------------------------------------
const WATCHDOG_INTERVAL_MS = 60_000; // check every minute

function _killOrphanGitProcs(thresholdMs) {
  // Works on Linux/macOS. On Windows there is no `pkill`, so we skip silently.
  const isUnix = process.platform !== 'win32';
  if (!isUnix) return;
  // Find git processes running longer than threshold seconds
  const minSec = Math.ceil(thresholdMs / 1000);
  execFile('sh', ['-c',
    `pgrep -x git | while read pid; do
       etime=$(ps -o etimes= -p $pid 2>/dev/null | tr -d ' ');
       [ -n "$etime" ] && [ "$etime" -gt ${minSec} ] && kill -9 $pid && echo $pid;
     done`
  ], (err, stdout) => {
    const killed = stdout.trim().split('\n').filter(Boolean);
    if (killed.length > 0) {
      logger.warn('git.watchdog.killed', { pids: killed, reason: `running >${minSec}s` });
    }
  });
}

async function _removeStaleLock() {
  const lockFile = path.join(DB_PATH, '.git', 'index.lock');
  try {
    const stat = await fs.stat(lockFile);
    const ageMs = Date.now() - stat.mtimeMs;
    const threshold = (config.gitTimeoutMs > 0 ? config.gitTimeoutMs : 30_000) * 2;
    if (ageMs > threshold) {
      await fs.unlink(lockFile);
      logger.warn('git.watchdog.lock_removed', { ageMs, lockFile });
      // Reset the chain so future ops are not permanently blocked
      _gitChain = Promise.resolve();
      _gitLockAcquiredAt = 0;
    }
  } catch {
    // Lock file does not exist – that's the normal case
  }
}

let _watchdogInterval = null;

function startGitWatchdog() {
  if (_watchdogInterval) clearInterval(_watchdogInterval);
  const threshold = (config.gitTimeoutMs > 0 ? config.gitTimeoutMs : 30_000) * 2;
  _watchdogInterval = setInterval(async () => {
    // 1. Check if the lock has been held too long
    if (_gitLockAcquiredAt > 0) {
      const heldMs = Date.now() - _gitLockAcquiredAt;
      if (heldMs > threshold) {
        logger.warn('git.watchdog.lock_stuck', { heldMs, thresholdMs: threshold });
      }
    }
    // 2. Remove stale index.lock
    await _removeStaleLock();
    // 3. Kill orphaned OS-level git processes
    _killOrphanGitProcs(threshold);
  }, WATCHDOG_INTERVAL_MS);
  logger.info('startup.git_watchdog', { intervalSec: WATCHDOG_INTERVAL_MS / 1000, thresholdMs: threshold });
}

function stopGitWatchdog() {
  if (_watchdogInterval) { clearInterval(_watchdogInterval); _watchdogInterval = null; }
}

/**
 * Initialize the database directory.
 * - If GIT_DB_URL is set: clone (or pull) the remote repo into DATA_DIR
 * - If no URL: use DATA_DIR as-is (must already be a git repo or plain dir)
 */
function buildAuthUrl(url) {
  if (!config.gitDbUser || !url.startsWith('http')) return url;
  const parsed = new URL(url);
  parsed.username = encodeURIComponent(config.gitDbUser);
  parsed.password = encodeURIComponent(config.gitDbPassword);
  return parsed.toString();
}

async function ensureGitIdentity(git) {
  await git.addConfig('user.name', config.gitDbAuthorName);
  await git.addConfig('user.email', config.gitDbAuthorEmail);
}

async function initDatabase() {
  const url = config.gitDbUrl;
  const dir = config.dataDir;
  const branch = config.gitDbBranch;

  await fs.mkdir(dir, { recursive: true });

  if (!url) {
    // No remote URL – ensure local dir is a git repo
    const git = makeGit({ baseDir: dir });
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await git.init();
      await ensureGitIdentity(git);
      // Create minimal empty structure — admin account is created by ensureBootstrapAdmin()
      const orgPath = path.join(dir, 'organisation.json');
      try { await fs.access(orgPath); } catch {
        await fs.mkdir(path.join(dir, 'chapter'), { recursive: true });
        await fs.mkdir(path.join(dir, 'user'),    { recursive: true });
        await fs.mkdir(path.join(dir, 'requests'), { recursive: true });
        await fs.writeFile(orgPath, JSON.stringify({
          id: 'org', name: '', chapters: [], orgAdmins: [], zeitstelle: []
        }, null, 2));
        await git.add('.');
        await git.commit('Init: empty database structure');
      }
    } else {
      await ensureGitIdentity(git);
    }
    logger.info('startup.db', { mode: 'local', dir });
    return;
  }

  // Remote URL given – clone or pull
  const gitEnv = {};
  if (!config.gitSslVerify) {
    gitEnv.GIT_SSL_NO_VERIFY = '1';
  }

  const authUrl = buildAuthUrl(url);
  try {
    await fs.access(path.join(dir, '.git'));
    // Already cloned – update remote URL with credentials, then pull
    const git = makeGit({ baseDir: dir });
    await ensureGitIdentity(git);
    await git.env(gitEnv).remote(['set-url', 'origin', authUrl]);
    await git.env(gitEnv).pull('origin', branch);
    logger.info('startup.db', { mode: 'pull', url: url.replace(/:[^@]*@/, ':***@'), branch });
  } catch {
    // Not yet cloned – clone
    const git = makeGit();
    await git.env(gitEnv).clone(authUrl, dir, ['--branch', branch]);
    const clonedGit = makeGit({ baseDir: dir });
    await ensureGitIdentity(clonedGit);
    // Keep credentials in remote URL for future pushes
    await clonedGit.env(gitEnv).remote(['set-url', 'origin', authUrl]);
    logger.info('startup.db', { mode: 'clone', url: url.replace(/:[^@]*@/, ':***@'), branch });
  }
}

function getDbPath() { return DB_PATH; }

async function readJson(filePath) {
  let content = await fs.readFile(filePath, 'utf-8');
  // Strip UTF-8 BOM if present (Windows editors sometimes add it)
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
  return JSON.parse(content);
}

async function writeJson(filePath, data, commitMessage, authorKuerzel) {
  // Validate: serialize first, then write — guarantees only valid JSON hits disk
  let json;
  try {
    json = JSON.stringify(data, null, 2);
  } catch (err) {
    logger.error('writeJson.serialize_failed', { file: path.basename(filePath), err: err.message });
    throw new Error('Daten können nicht als JSON gespeichert werden');
  }
  if (!json || json === 'null' || json === 'undefined') {
    throw new Error('writeJson: leere oder ungültige Daten');
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json, 'utf-8');
  await gitSave(commitMessage || 'Update', authorKuerzel);
  const cat = _fileCategory(filePath);
  if (cat !== 'credentials') {
    sse.broadcast('invalidate', { category: cat, id: path.basename(filePath, '.json'), action: 'write', by: authorKuerzel || 'system' });
  }
}

async function deleteJson(filePath) {
  await fs.unlink(filePath);
  await gitSave(`Gelöscht: ${path.basename(filePath)}`, 'system');
  const cat = _fileCategory(filePath);
  if (cat !== 'credentials') {
    sse.broadcast('invalidate', { category: cat, id: path.basename(filePath, '.json'), action: 'delete' });
  }
}

/** Derive a category from the file path (user, chapter, event, request, etc.). */
function _fileCategory(filePath) {
  const rel = path.relative(DB_PATH, filePath).replace(/\\/g, '/');
  if (rel.startsWith('user/'))        return 'user';
  if (rel.startsWith('requests/'))    return 'request';
  if (rel === 'organisation.json')    return 'organisation';
  if (rel === 'credentials.json')     return 'credentials';
  if (rel.includes('/events/'))       return 'event';
  if (rel.includes('/sparte/'))       return 'sparte';
  if (rel.includes('/chapter'))       return 'chapter';
  return 'other';
}

/**
 * Stage all changes and commit locally.
 * Push to the remote is intentionally NOT done here — it happens only in
 * gitCommitAndPush() (autosync every 5 min) so that a slow/unreachable remote
 * can never block a write request or leave a dead daemon thread behind.
 * All operations are serialised via withGitLock to avoid lock-file races.
 */
async function gitSave(commitMessage, authorKuerzel) {
  return withGitLock(async () => {
    const git = getGit();
    try {
      await git.add('.');
      const status = await git.status();
      if (status.staged.length === 0) return; // nothing to commit
      const kuerzel = authorKuerzel || 'system';
      const author = `${kuerzel} <${kuerzel}@mcm.local>`;
      const message = `${kuerzel}: ${commitMessage}`;
      await git.commit(message, { '--author': author });
      logger.debug('git.commit', { msg: commitMessage });
    } catch (e) {
      // File is already saved – don't let git errors break the API
      logger.error('git.save', { err: e.message });
    }
  });
}

/**
 * Commit all staged changes and push to remote (if configured).
 * Called periodically (every 5 min) and on manual trigger.
 * Serialised via withGitLock; the per-operation timeout in getGit() ensures
 * a hung push is killed after GIT_TIMEOUT_MS and does not block the queue.
 */
async function gitCommitAndPush() {
  return withGitLock(async () => {
    const git = getGit();
    try {
      const status = await git.status();
      if (status.staged.length === 0 && status.not_added.length === 0 && status.modified.length === 0) {
        return { committed: false, pushed: false, message: 'Keine Änderungen' };
      }
      // Stage everything (catches any missed files)
      await git.add('.');
      await git.commit(`Auto-Sync ${new Date().toISOString()}`, {
        '--author': 'system <system@mcm.local>'
      });
      let pushed = false;
      if (config.gitDbUrl) {
        const gitEnv = {};
        if (!config.gitSslVerify) gitEnv.GIT_SSL_NO_VERIFY = '1';
        await git.env(gitEnv).remote(['set-url', 'origin', buildAuthUrl(config.gitDbUrl)]);
        await git.env(gitEnv).push(['-u', 'origin', config.gitDbBranch]);
        pushed = true;
      }
      return { committed: true, pushed, message: 'Synchronisiert' };
    } catch (e) {
      return { committed: false, pushed: false, message: e.message };
    }
  });
}

let _syncInterval = null;

function startAutoSync(intervalMs = 5 * 60 * 1000) {
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(async () => {
    // Prune expired token revocations (older than 8h JWT lifetime)
    const cutoff = Date.now() - 8 * 60 * 60 * 1000;
    for (const [k, ts] of _revokedAt) { if (ts < cutoff) _revokedAt.delete(k); }

    const result = await gitCommitAndPush();
    if (result.committed) {
      logger.info('git.autosync', { pushed: result.pushed });
    }
  }, intervalMs);
  logger.info('startup.autosync', { intervalSec: intervalMs / 1000 });
}

function stopAutoSync() {
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
}

async function readCredentials() {
  try {
    return await readJson(path.join(DB_PATH, 'credentials.json'));
  } catch {
    return {};
  }
}

function invalidateCredentialsCache() { _credCache = null; }

async function readCredentialsCached() {
  const now = Date.now();
  if (_credCache && now - _credCacheTs < CRED_CACHE_TTL) return _credCache;
  _credCache = await readCredentials();
  _credCacheTs = now;
  return _credCache;
}

/**
 * Returns { hash, mustChange } for a given kuerzel.
 * Handles both formats:
 *   legacy:  { "s888": "$2b$..." }
 *   current: { "s888": { hash: "$2b$...", mustChange: true } }
 */
async function getCredential(kuerzel) {
  const creds = await readCredentials();
  const entry = creds[kuerzel];
  if (!entry) return null;
  if (typeof entry === 'string') return { hash: entry, mustChange: false };
  return { hash: entry.hash, mustChange: entry.mustChange === true };
}

async function writeCredential(kuerzel, hash, mustChange, authorKuerzel) {
  const credPath = path.join(DB_PATH, 'credentials.json');
  const creds = await readCredentials();
  creds[kuerzel] = { hash, mustChange: mustChange === true };
  invalidateCredentialsCache();
  await writeJson(credPath, creds, `Passwort geändert: ${kuerzel}`, authorKuerzel || 'system');
}

async function deleteCredential(kuerzel, authorKuerzel) {
  const credPath = path.join(DB_PATH, 'credentials.json');
  const creds = await readCredentials();
  delete creds[kuerzel];
  invalidateCredentialsCache();
  await writeJson(credPath, creds, `Credential gelöscht: ${kuerzel}`, authorKuerzel || 'system');
}

/**
 * Forces all active JWT sessions for a user to fail on the next API request.
 * Stored only in process memory – no file write, no git commit.
 * After a server restart existing tokens remain valid until their 8 h expiry.
 */
function invalidateUserToken(kuerzel) {
  _revokedAt.set(kuerzel, Date.now());
  logger.info('auth.token_revoked', { user: kuerzel });
}

/** Returns the revocation timestamp (ms) for a user, or 0 if not revoked. */
function getRevokedAt(kuerzel) {
  return _revokedAt.get(kuerzel) || 0;
}

async function readOrganisation() {
  return readJson(path.join(DB_PATH, 'organisation.json'))
    .catch(e => {
      if (e.code === 'ENOENT') return { name: '', chapters: [], orgAdmins: [] };
      throw e;
    });
}

/**
 * Read all sparte files for a chapter.
 * Returns an array of { id, leiter: [] } objects.
 */
async function readChapterSparten(chapterId) {
  const sparteDir = path.join(DB_PATH, 'chapter', chapterId, 'sparte');
  try {
    const files = await fs.readdir(sparteDir);
    const sparten = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try { sparten.push(await readJson(path.join(sparteDir, file))); } catch {}
      }
    }
    return sparten;
  } catch {
    return [];
  }
}

/**
 * Read a single chapter, merging sparte files into the response.
 * Returned shape: { id, name, admins, sparten: [{id, name, admins, datumAngelegt, datumStillgelegt}] }
 */
async function readChapter(id) {
  const chapter = await readJson(path.join(DB_PATH, 'chapter', id, 'chapter.json'));
  const sparten = await readChapterSparten(id);
  chapter.sparten = sparten.map(s => ({
    id: s.id,
    name: s.name || s.id,
    admins: s.admins || [],
    datumAngelegt: s.datumAngelegt || null,
    datumStillgelegt: s.datumStillgelegt || null,
  }));
  return chapter;
}

async function readChapters() {
  const org = await readOrganisation();
  const chapters = [];
  for (const chapterId of org.chapters || []) {
    try { chapters.push(await readChapter(chapterId)); } catch {}
  }
  return chapters;
}

/**
 * Write chapter base file and all sparte files from merged chapter object.
 * Handles sparte additions, updates, and deletions.
 */
async function writeChapter(chapter, authorKuerzel) {
  const { id, name, admins, sparten = [] } = chapter;
  const chapterDir = path.join(DB_PATH, 'chapter', id);
  const sparteDir  = path.join(chapterDir, 'sparte');
  await fs.mkdir(sparteDir, { recursive: true });
  await fs.mkdir(path.join(chapterDir, 'events'), { recursive: true });

  // Write base chapter file
  await writeJson(path.join(chapterDir, 'chapter.json'), { id, name, admins: admins || [], gegruendet: chapter.gegruendet || null, aufgeloest: chapter.aufgeloest || null },
    `Chapter: ${id}`, authorKuerzel);

  // Write / update each sparte file – sparten is now [{ id, name, admins, datumAngelegt, datumStillgelegt }]
  for (const sp of sparten) {
    const sparteData = {
      id: sp.id,
      name: sp.name || sp.id,
      admins: sp.admins || [],
      datumAngelegt: sp.datumAngelegt || null,
      datumStillgelegt: sp.datumStillgelegt || null,
    };
    await writeJson(path.join(sparteDir, `${sp.id}.json`), sparteData,
      `Sparte ${sp.id} in ${id}`, authorKuerzel);
  }

  // Delete sparte files that are no longer in the list
  try {
    const sparteIds = sparten.map(s => s.id);
    const existing = await fs.readdir(sparteDir);
    for (const file of existing) {
      const sparteId = file.replace('.json', '');
      if (file.endsWith('.json') && !sparteIds.includes(sparteId)) {
        await deleteJson(path.join(sparteDir, `${sparteId}.json`));
      }
    }
  } catch {}
}

/**
 * Read all events for a given chapter.
 */
async function readChapterEvents(chapterId) {
  const eventsDir = path.join(DB_PATH, 'chapter', chapterId, 'events');
  try {
    const files = await fs.readdir(eventsDir);
    const events = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try { events.push(await readJson(path.join(eventsDir, file))); } catch {}
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function readChapterEvent(chapterId, eventId) {
  return readJson(path.join(DB_PATH, 'chapter', chapterId, 'events', `${eventId}.json`));
}

async function writeChapterEvent(chapterId, event, authorKuerzel) {
  const dir = path.join(DB_PATH, 'chapter', chapterId, 'events');
  await fs.mkdir(dir, { recursive: true });
  await writeJson(path.join(dir, `${event.id}.json`), event,
    `Event ${event.id}`, authorKuerzel);
}

async function deleteChapterEvent(chapterId, eventId, authorKuerzel) {
  await deleteJson(path.join(DB_PATH, 'chapter', chapterId, 'events', `${eventId}.json`));
}

async function deleteChapterDir(chapterId, authorKuerzel) {
  const dir = path.join(DB_PATH, 'chapter', chapterId);
  await fs.rm(dir, { recursive: true, force: true });
  await gitSave(`Chapter ${chapterId} gelöscht`, authorKuerzel);
}

/**
 * Ensure a bootstrap admin user exists.
 * Runs after initDatabase(). If no 'admin' credential is present, creates:
 *   - user/admin.json  (name: Administrator)
 *   - credentials.json entry  (admin / admin, mustChange: true)
 *   - organisation.json  (admin added to orgAdmins)
 * Idempotent – skips silently if admin already exists.
 */
async function ensureBootstrapAdmin() {
  const bcrypt = require('bcryptjs');
  const crypto = require('crypto');
  const creds = await readCredentials();
  if (creds.admin) return; // already bootstrapped

  const orgPath = path.join(DB_PATH, 'organisation.json');
  let org;
  try { org = await readJson(orgPath); } catch {
    org = { id: 'org', name: '', chapters: [], orgAdmins: [], zeitstelle: [] };
  }
  if (!org.orgAdmins) org.orgAdmins = [];
  if (!org.orgAdmins.includes('admin')) org.orgAdmins.push('admin');

  const bootstrapPassword = crypto.randomBytes(16).toString('hex');
  const adminHash = await bcrypt.hash(bootstrapPassword, 12);
  await fs.mkdir(path.join(DB_PATH, 'user'),     { recursive: true });
  await fs.mkdir(path.join(DB_PATH, 'requests'), { recursive: true });

  await fs.writeFile(orgPath,
    JSON.stringify(org, null, 2), 'utf-8');
  await fs.writeFile(path.join(DB_PATH, 'user', 'admin.json'),
    JSON.stringify({ kuerzel: 'admin', name: 'Administrator', vorname: 'System', chapters: [] }, null, 2), 'utf-8');
  await fs.writeFile(path.join(DB_PATH, 'credentials.json'),
    JSON.stringify({ ...creds, admin: { hash: adminHash, mustChange: true } }, null, 2), 'utf-8');
  invalidateCredentialsCache();

  const git = getGit();
  await git.add('.');
  const status = await git.status();
  if (status.staged.length > 0) {
    await git.commit('Bootstrap: admin user created (change password on first login)');
  }
  const msg = `Bootstrap admin created — Kuerzel: admin / Passwort: ${bootstrapPassword} — Passwort sofort aendern!`;
  logger.warn('startup.bootstrap', { msg });
  // Also print prominently to stdout so ops can find it in container/pod logs
  console.log('\n' + '='.repeat(72));
  console.log('  INITIAL ADMIN PASSWORD');
  console.log(`  Kuerzel : admin`);
  console.log(`  Passwort: ${bootstrapPassword}`);
  console.log('  Bitte das Passwort nach dem ersten Login sofort aendern!');
  console.log('='.repeat(72) + '\n');
}

async function readUser(kuerzel) {
  return readJson(path.join(DB_PATH, 'user', `${kuerzel}.json`));
}

async function gitLog(limit = 50) {
  limit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const git = getGit();
  try {
    const log = await git.log([
      `--max-count=${limit}`,
      '--pretty=format:%H%x1f%an%x1f%aI%x1f%s',
    ]);
    return (log.all || []).map(e => ({
      hash:    e.hash,
      author:  e.author_name,
      date:    e.date,
      message: e.message,
    }));
  } catch {
    return [];
  }
}

async function readAllUsers() {
  const userDir = path.join(DB_PATH, 'user');
  try {
    const files = await fs.readdir(userDir);
    const users = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const user = await readJson(path.join(userDir, file));
          users.push(user);
        } catch {
          // Kaputte Datei überspringen
        }
      }
    }
    return users;
  } catch {
    return [];
  }
}

module.exports = {
  DB_PATH,
  initDatabase,
  getDbPath,
  gitCommitAndPush,
  startAutoSync,
  stopAutoSync,
  startGitWatchdog,
  stopGitWatchdog,
  readCredentials,
  getCredential,
  writeCredential,
  deleteCredential,
  invalidateUserToken,
  getRevokedAt,
  ensureBootstrapAdmin,
  readOrganisation,
  readChapters,
  readChapter,
  readChapterSparten,
  writeChapter,
  readChapterEvents,
  readChapterEvent,
  writeChapterEvent,
  deleteChapterEvent,
  deleteChapterDir,
  readUser,
  readAllUsers,
  writeJson,
  deleteJson,
  gitLog,
};
