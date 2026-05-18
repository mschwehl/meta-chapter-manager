const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const TMP_DIR = path.join(ROOT_DIR, '.tmp');

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 120000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const details = (stderr || err.message || '').trim();
        reject(new Error(`git ${args.join(' ')} failed: ${details}`));
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

function buildAuthUrl(remoteUrl, user, password) {
  const parsed = new URL(remoteUrl);
  parsed.username = encodeURIComponent(user);
  parsed.password = encodeURIComponent(password);
  return parsed.toString();
}

async function seedRemoteBranch(remoteUrl, user, password, branch, syncStrategy) {
  const authUrl = buildAuthUrl(remoteUrl, user, password);
  const repoDir = path.join(TMP_DIR, 'git-seed');

  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(repoDir, { recursive: true });

  await runGit(['init'], repoDir);
  await runGit(['config', 'user.name', 'MCM Test Runner'], repoDir);
  await runGit(['config', 'user.email', 'mcm-tests@example.local'], repoDir);

  await fs.mkdir(path.join(repoDir, 'chapter'), { recursive: true });
  await fs.mkdir(path.join(repoDir, 'requests'), { recursive: true });
  await fs.mkdir(path.join(repoDir, 'user'), { recursive: true });

  const org = {
    id: 'org',
    name: 'MCM Test Organisation',
    chapters: [],
    orgAdmins: ['admin'],
    zeitstelle: [],
    gitSyncStrategy: syncStrategy,
  };

  const adminUser = {
    kuerzel: 'admin',
    name: 'Administrator',
    vorname: 'Test',
    orgeinheit: 'TEST',
    chapters: [],
  };

  await fs.writeFile(path.join(repoDir, 'organisation.json'), JSON.stringify(org, null, 2), 'utf-8');
  await fs.writeFile(path.join(repoDir, 'user', 'admin.json'), JSON.stringify(adminUser, null, 2), 'utf-8');
  await fs.writeFile(path.join(repoDir, 'credentials.json'), JSON.stringify({}, null, 2), 'utf-8');

  await runGit(['add', '.'], repoDir);
  await runGit(['commit', '-m', 'Test baseline'], repoDir);
  await runGit(['branch', '-M', branch], repoDir);
  await runGit(['remote', 'add', 'origin', authUrl], repoDir);
  await runGit(['push', '--force', '-u', 'origin', branch], repoDir);
}

async function main() {
  const port = process.env.MCM_TEST_PORT || '3301';
  const baseUrl = process.env.MCM_TEST_BASE_URL || `http://127.0.0.1:${port}`;
  const remote = process.env.MCM_TEST_GIT_REMOTE || 'http://localhost:8080/git/root/meta-data.git';
  const gitUser = process.env.MCM_TEST_GIT_USER || 'root';
  const gitPassword = process.env.MCM_TEST_GIT_PASSWORD || 'root';
  const gitBranch = process.env.MCM_TEST_GIT_BRANCH || 'test-suite';
  const syncStrategy = process.env.MCM_TEST_SYNC_STRATEGY || 'action-based';

  const dataDir = path.join(TMP_DIR, 'test-data');
  const docsDir = path.join(TMP_DIR, 'test-docs');

  await fs.mkdir(TMP_DIR, { recursive: true });
  await seedRemoteBranch(remote, gitUser, gitPassword, gitBranch, syncStrategy);
  await fs.rm(dataDir, { recursive: true, force: true });
  await fs.rm(docsDir, { recursive: true, force: true });

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(port);
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'mcm-test-secret';
  process.env.DATA_DIR = dataDir;
  process.env.DOCS_DIR = docsDir;
  process.env.GIT_DB_URL = remote;
  process.env.GIT_DB_USER = gitUser;
  process.env.GIT_DB_PASSWORD = gitPassword;
  process.env.GIT_DB_BRANCH = gitBranch;
  process.env.GIT_SSL_VERIFY = 'false';
  process.env.GIT_SYNC_STRATEGY = syncStrategy;
  process.env.GIT_AUTOSYNC_INTERVAL_MS = process.env.GIT_AUTOSYNC_INTERVAL_MS || '15000';
  process.env.BOOTSTRAP_ADMIN_PASSWORD = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'admin';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';

  process.stdout.write(`Starting test server on ${baseUrl}\n`);
  require(path.join(ROOT_DIR, 'server', 'index.js'));
}

main().catch(err => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
