'use strict';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

function log(level, event, data) {
  if (LEVELS[level] < MIN) return;
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level: level.toUpperCase(), event, ...data }) + '\n'
  );
}

/**
 * Express middleware: logs every HTTP request as a JSON line.
 * Skips static vendor assets to reduce noise.
 */
function requestMiddleware() {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      if (/^\/(vendor|lib)\//.test(req.path)) return;
      log('info', 'http', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        ip: req.ip,
        user: req.user?.kuerzel,
      });
    });
    next();
  };
}

module.exports = {
  debug: (event, data) => log('debug', event, data),
  info:  (event, data) => log('info',  event, data),
  warn:  (event, data) => log('warn',  event, data),
  error: (event, data) => log('error', event, data),
  requestMiddleware,
};
