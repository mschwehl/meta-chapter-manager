const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { authMiddleware } = require('../middleware/auth');
const { getCredential, writeCredential, readUser, readChapters, readOrganisation } = require('../lib/gitdb');

const router = express.Router();

const PASSWORD_MIN_LENGTH = 8;

function validatePasswordStrength(pw) {
  if (!pw || pw.length < PASSWORD_MIN_LENGTH) {
    return `Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein`;
  }
  return null;
}

router.post('/login', async (req, res) => {
  const { kuerzel, password } = req.body;
  if (!kuerzel || !password) {
    return res.status(400).json({ error: 'Kürzel und Passwort erforderlich' });
  }

  const credential = await getCredential(kuerzel);

  // No credential entry = kuerzel is the initial password (set on account creation / after reset)
  if (!credential) {
    if (password !== kuerzel) {
      console.log(`[auth] LOGIN FAILED (initial) – ${kuerzel}`);
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    console.log(`[auth] LOGIN OK (initial pw) – ${kuerzel}`);
    // Fall through with mustChange flag so the client forces password change
  } else {
    const valid = await bcrypt.compare(password, credential.hash);
    if (!valid) {
      console.log(`[auth] LOGIN FAILED – ${kuerzel}`);
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }
    console.log(`[auth] LOGIN OK – ${kuerzel}`);
  }

  const user = await readUser(kuerzel).catch(() => ({ kuerzel, name: '', vorname: '' }));
  const chapters = await readChapters();
  const org = await readOrganisation().catch(() => ({ orgAdmins: [] }));

  // Rollen aus chapter-JSON ableiten
  const roles = {};
  const spartenleiter = [];
  for (const chapter of chapters) {
    if ((chapter.admins || []).includes(kuerzel)) {
      roles[chapter.id] = 'chapteradmin';
    }
    for (const sparte of (chapter.sparten || [])) {
      if ((sparte.admins || []).includes(kuerzel)) {
        // Spartenleiter-Einträge (unabhängig von chapteradmin)
        spartenleiter.push({ chapterId: chapter.id, sparteId: sparte.id });
        // Spartenadmin-Rolle nur wenn nicht bereits chapteradmin
        if (roles[chapter.id] !== 'chapteradmin') {
          if (!roles[chapter.id]) roles[chapter.id] = { role: 'spartenadmin', sparten: [] };
          roles[chapter.id].sparten = roles[chapter.id].sparten || [];
          roles[chapter.id].sparten.push(sparte.id);
        }
      }
    }
  }

  // Organisations-Admin
  const isOrgaAdmin = (org.orgAdmins || []).includes(kuerzel);

  // Zeitstelle (full read access to all data + documents)
  const isZeitstelle = (org.zeitstelle || []).includes(kuerzel);

  const displayName = user.name || kuerzel;
  const displayVorname = user.vorname || '';

  const token = jwt.sign(
    { kuerzel, name: displayName, vorname: displayVorname, roles, spartenleiter, orgaAdmin: isOrgaAdmin, zeitstelle: isZeitstelle },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    kuerzel,
    name: displayName,
    vorname: displayVorname,
    roles,
    spartenleiter,
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
  console.log(`[auth] PASSWORD CHANGED – ${kuerzel}`);

  res.json({ message: 'Passwort erfolgreich geändert' });
});

module.exports = router;
