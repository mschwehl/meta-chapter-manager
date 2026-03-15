const jwt = require('jsonwebtoken');
const config = require('../config');
const { getRevokedAt } = require('../lib/gitdb');
const logger = require('../lib/logger');

const JWT_SECRET = config.jwtSecret;

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Check in-memory revocation table (role changes, admin-forced logout).
    // No file I/O – purely in process memory.
    const revokedAt = getRevokedAt(payload.kuerzel);
    if (revokedAt && payload.iat * 1000 < revokedAt) {
      logger.warn('auth.session_revoked', { user: payload.kuerzel, ip: req.ip });
      return res.status(401).json({ error: 'Sitzung abgelaufen, bitte neu anmelden' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Ungültiges oder abgelaufenes Token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
