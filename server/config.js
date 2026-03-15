const path = require('path');

// Fail fast: JWT_SECRET must be set explicitly — no insecure default.
if (!process.env.JWT_SECRET) {
  process.stderr.write(JSON.stringify({
    ts: new Date().toISOString(), level: 'FATAL', event: 'startup.config',
    msg: 'JWT_SECRET environment variable is not set. Set a strong secret before starting.',
  }) + '\n');
  process.exit(1);
}

// All configurable via environment variables
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET,

  // Git database repo – can be file:// or https:// URL, or a local path
  // Examples:
  //   GIT_DB_URL=https://gitea.example.com/myorg/database.git
  //   GIT_DB_URL=/data/database          (local path, no clone needed)
  gitDbUrl: process.env.GIT_DB_URL || '',

  // Credentials for HTTP(S) git access (optional)
  //   GIT_DB_USER=myuser
  //   GIT_DB_PASSWORD=mytoken
  gitDbUser: process.env.GIT_DB_USER || '',
  gitDbPassword: process.env.GIT_DB_PASSWORD || '',

  // Git commit author name and email
  //   GIT_DB_AUTHOR_NAME=MCM System
  //   GIT_DB_AUTHOR_EMAIL=system@mcm.local
  gitDbAuthorName: process.env.GIT_DB_AUTHOR_NAME || 'MCM System',
  gitDbAuthorEmail: process.env.GIT_DB_AUTHOR_EMAIL || 'system@mcm.local',

  // Branch to use in the database repo
  gitDbBranch: process.env.GIT_DB_BRANCH || 'develop',

  // Local working directory where the database repo gets cloned to
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Local path for generated documents (DOCX etc.) – NOT in git
  docsDir: process.env.DOCS_DIR || path.join(__dirname, '..', 'docs'),

  // If https git URL: skip SSL verification (self-signed certs)
  gitSslVerify: process.env.GIT_SSL_VERIFY !== 'false',

  // Allowed CORS origin for the API.
  // '': same-origin only (recommended for self-hosted / OpenShift behind a single route)
  // '*': wildcard – allow any origin (use for local dev / testing ONLY)
  // 'https://app.example.com': single trusted origin
  corsOrigin: process.env.CORS_ORIGIN || '',
};

module.exports = config;
