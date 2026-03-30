const jwt = require('jsonwebtoken');
const config = require('../config');
const { getRevokedAt, readUser, readChapters, readOrganisation } = require('../lib/gitdb');
const logger = require('../lib/logger');
const { ROLE_LEVEL } = require('../../client/i18n.js');

const JWT_SECRET = config.jwtSecret;

// Tokens issued before this timestamp (i.e. before this server process started)
// are rejected — ensures a pod/server restart forces everyone to re-login.
const SERVER_START_MS = Date.now();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // Reject tokens issued before this server process started.
    if (payload.iat * 1000 < SERVER_START_MS) {
      return res.status(401).json({ error: 'Sitzung abgelaufen, bitte neu anmelden' });
    }

    // Check in-memory revocation table (role changes, admin-forced logout).
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

module.exports = { authMiddleware, JWT_SECRET, buildTokenForUser };

/**
 * Build a fresh signed token for the given kuerzel, re-reading roles from disk.
 * Returns { token, kuerzel, name, vorname, roles, orgaAdmin, zeitstelle }
 * or null if the user no longer exists.
 */
async function buildTokenForUser(kuerzel) {
  const user = await readUser(kuerzel).catch(() => null);
  if (!user) return null;
  const [chapters, org] = await Promise.all([
    readChapters(),
    readOrganisation().catch(() => ({ orgAdmins: [], zeitstelle: [] })),
  ]);
  const roles = {};
  for (const chapter of chapters) {
    const isChapterAdmin = (chapter.admins || []).includes(kuerzel);
    const adminSparten = (chapter.sparten || [])
      .filter(sp => (sp.admins || []).includes(kuerzel))
      .map(sp => sp.id);
    if (isChapterAdmin) {
      roles[chapter.id] = { level: ROLE_LEVEL.CHAPTER, sparten: adminSparten };
    } else if (adminSparten.length > 0) {
      roles[chapter.id] = { level: ROLE_LEVEL.SPARTE, sparten: adminSparten };
    }
  }
  const isOrgaAdmin = (org.orgAdmins || []).includes(kuerzel);
  const isZeitstelle = (org.zeitstelle || []).includes(kuerzel);
  const token = jwt.sign(
    { kuerzel, name: user.name || kuerzel, vorname: user.vorname || '', roles, orgaAdmin: isOrgaAdmin, zeitstelle: isZeitstelle },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  return { token, kuerzel, name: user.name || kuerzel, vorname: user.vorname || '', roles, orgaAdmin: isOrgaAdmin, zeitstelle: isZeitstelle };
}
