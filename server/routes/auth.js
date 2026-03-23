const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { JWT_SECRET } = require('../middleware/auth');
const { authMiddleware } = require('../middleware/auth');
const { getCredential, writeCredential, readUser, readChapters, readOrganisation } = require('../lib/gitdb');
const logger = require('../lib/logger');
const { ROLE_LEVEL } = require('../../client/i18n.js');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' },
});

const PASSWORD_MIN_LENGTH = 8;

function validatePasswordStrength(pw) {
  if (!pw || pw.length < PASSWORD_MIN_LENGTH) {
    return `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`;
  }
  return null;
}

router.post('/login', loginLimiter, async (req, res) => {
  const kuerzel = (req.body.kuerzel || '').trim().toLowerCase();
  const { password } = req.body;
  if (!kuerzel || !password) {
    return res.status(400).json({ error: 'Kürzel und Passwort erforderlich' });
  }

  // Reject immediately if no user profile exists.
  // This closes the phantom-login gap where kuerzel === password would succeed
  // for any string that has no credential entry yet.
  const user = await readUser(kuerzel).catch(() => null);
  if (!user) {
    logger.warn('auth.login.fail', { user: kuerzel, ip: req.ip, reason: 'user_not_found' });
    return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
  }

  const credential = await getCredential(kuerzel);

  // No credential entry = kuerzel is the initial password (set on account creation / after reset)
  if (!credential) {
    if (password !== kuerzel) {
      logger.warn('auth.login.fail', { user: kuerzel, ip: req.ip, reason: 'bad_initial_pw' });
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    logger.info('auth.login.ok', { user: kuerzel, ip: req.ip, initial: true });
    // Fall through with mustChange flag so the client forces password change
  } else {
    const valid = await bcrypt.compare(password, credential.hash);
    if (!valid) {
      logger.warn('auth.login.fail', { user: kuerzel, ip: req.ip, reason: 'bad_password' });
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    logger.info('auth.login.ok', { user: kuerzel, ip: req.ip });
  }

  const chapters = await readChapters();
  const org = await readOrganisation().catch(() => ({ orgAdmins: [] }));

  // Rollen aus chapter-JSON ableiten.
  // Einheitliche Form: { chapterId: { level: 'chapter'|'sparte', sparten: string[] } }
  //   level 'chapter'  = Chapter-Admin (Superadmin) – Vollzugriff auf alle Sparten
  //   level 'sparte'   = Spartenadmin / Spartenleiter – nur eigene Sparten
  //   sparten[]        = Sparten, in denen der User explizit als Admin/Leiter eingetragen ist
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

  // Organisations-Admin
  const isOrgaAdmin = (org.orgAdmins || []).includes(kuerzel);

  // Zeitstelle (full read access to all data + documents)
  const isZeitstelle = (org.zeitstelle || []).includes(kuerzel);

  const displayName = user.name || kuerzel;
  const displayVorname = user.vorname || '';

  const token = jwt.sign(
    { kuerzel, name: displayName, vorname: displayVorname, roles, orgaAdmin: isOrgaAdmin, zeitstelle: isZeitstelle },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    kuerzel,
    name: displayName,
    vorname: displayVorname,
    roles,
    orgaAdmin: isOrgaAdmin,
    zeitstelle: isZeitstelle,
    mustChangePassword: credential ? credential.mustChange : true
  });
});

// POST /api/auth/change-password  (requires valid JWT)
router.post('/change-password', authMiddleware, async (req, res) => {
  const { kuerzel } = req.user;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Aktuelles und neues Passwort erforderlich' });
  }

  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) return res.status(400).json({ error: strengthError });

  const credential = await getCredential(kuerzel);

  // If no credential entry exists, current password is the kuerzel itself (initial state)
  const isInitial = !credential;
  const valid = isInitial
    ? currentPassword === kuerzel
    : await bcrypt.compare(currentPassword, credential.hash);
  if (!valid) return res.status(401).json({ error: 'Aktuelles Passwort ist falsch' });

  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Neues Passwort darf nicht identisch mit dem alten sein' });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  await writeCredential(kuerzel, newHash, false, kuerzel);
  logger.info('auth.password_changed', { user: kuerzel, ip: req.ip });

  res.json({ message: 'Passwort erfolgreich geändert' });
});

module.exports = router;
