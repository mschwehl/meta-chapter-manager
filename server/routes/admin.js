const express = require('express');
const os = require('os');
const {
  readAllUsers, readUser, writeJson, deleteJson, readCredentials, writeCredential, deleteCredential, DB_PATH, readOrganisation, readChapters, gitLog
} = require('../lib/gitdb');
const { requireChapterAdmin, requireOrgaAdmin } = require('../middleware/roles');
const config = require('../config');
const path = require('path');

const router = express.Router();

// GET /api/admin/users?chapterId=nsk
router.get('/users', async (req, res) => {
  const { chapterId } = req.query;
  const { roles, orgaAdmin, zeitstelle } = req.user;

  // OrgaAdmin / Zeitstelle: full access.
  // Chapter admins (superadmin / spartenadmin): only their chapters.
  // Regular members: read-only view of all org members (edit buttons are guarded in the SPA).
  const allowedChapters = (orgaAdmin || zeitstelle)
    ? null  // null = all
    : Object.entries(roles || {})
        .filter(([, r]) => r === 'chapteradmin' || r?.role === 'spartenadmin')
        .map(([id]) => id);

  let users = await readAllUsers();
  if (chapterId) {
    users = users.filter(u => u.chapters && u.chapters.some(c => c.chapterId === chapterId));
  } else if (allowedChapters && allowedChapters.length > 0) {
    // Chapter admin: only see members of their chapters
    users = users.filter(u =>
      u.chapters && u.chapters.some(c => allowedChapters.includes(c.chapterId))
    );
  }
  // allowedChapters = [] (regular member) â†’ no filter â†’ they see all (read-only)
  res.json(users);
});

// GET /api/admin/users/:kuerzel
router.get('/users/:kuerzel', async (req, res) => {
  try {
    const user = await readUser(req.params.kuerzel);
    res.json(user);
  } catch {
    res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
});

// POST /api/admin/users â€“ create user (kÃ¼rzel, name, vorname only â€” no chapters)
router.post('/users', requireChapterAdmin('chapterId'), async (req, res) => {
  const { kuerzel, name, vorname } = req.body;
  if (!kuerzel) return res.status(400).json({ error: 'KÃ¼rzel erforderlich' });
  if (!/^[a-z][a-z0-9]{3,4}$/.test(kuerzel)) return res.status(400).json({ error: 'KÃ¼rzel muss 4â€“5 Zeichen haben (Buchstaben aâ€“z und Ziffern, beginnt mit Buchstabe)' });

  // Duplikat prÃ¼fen
  try {
    await readUser(kuerzel);
    return res.status(409).json({ error: `KÃ¼rzel ${kuerzel} existiert bereits` });
  } catch { /* gut, existiert nicht */ }

  const userData = { kuerzel, name: name || '', vorname: vorname || '', chapters: [] };
  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, userData, `User angelegt: ${kuerzel}`, req.user.kuerzel);

  // No credential entry is written â€” initial password = kuerzel (handled by auth.js fallback)

  res.status(201).json(userData);
});

// PUT /api/admin/users/:kuerzel â€“ edit basic user data (name, vorname only)
router.put('/users/:kuerzel', async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const userChapters = (existing.chapters || []).map(c => c.chapterId);
    const hasAccess = userChapters.some(cid => roles?.[cid] === 'chapteradmin');
    if (!hasAccess) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  const updated = { ...existing };
  if (req.body.name !== undefined) updated.name = req.body.name;
  if (req.body.vorname !== undefined) updated.vorname = req.body.vorname;

  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, updated, `User bearbeitet: ${kuerzel}`, req.user.kuerzel);
  res.json(updated);
});

// POST /api/admin/users/:kuerzel/chapter â€“ add chapter membership
router.post('/users/:kuerzel/chapter', async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;
  const { chapterId, sparte, eintrittsdatum, austrittsdatum, status } = req.body;
  if (!chapterId || !sparte) return res.status(400).json({ error: 'chapterId und sparte erforderlich' });

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const r = roles?.[chapterId];
    const ok = r === 'chapteradmin' || (r?.role === 'spartenadmin' && (r.sparten||[]).includes(sparte));
    if (!ok) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  if (existing.chapters?.some(c => c.chapterId === chapterId && c.sparte === sparte)) {
    return res.status(409).json({ error: 'Mitgliedschaft existiert bereits' });
  }

  existing.chapters = existing.chapters || [];
  existing.chapters.push({
    chapterId,
    sparte,
    eintrittsdatum: eintrittsdatum || new Date().toISOString().slice(0, 10),
    austrittsdatum: austrittsdatum || null,
    status: status || 'aktiv'
  });

  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, existing, `Chapter ${chapterId}/${sparte} hinzugefÃ¼gt: ${kuerzel}`, req.user.kuerzel);
  res.json(existing);
});

// PATCH /api/admin/users/:kuerzel/chapter â€“ update membership (status, austrittsdatum, eintrittsdatum)
router.patch('/users/:kuerzel/chapter', async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;
  const { chapterId, sparte, ...updates } = req.body;
  if (!chapterId || !sparte) return res.status(400).json({ error: 'chapterId und sparte erforderlich' });

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const r = roles?.[chapterId];
    const ok = r === 'chapteradmin' || (r?.role === 'spartenadmin' && (r.sparten||[]).includes(sparte));
    if (!ok) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  const membership = (existing.chapters || []).find(c => c.chapterId === chapterId && c.sparte === sparte);
  if (!membership) return res.status(404).json({ error: 'Mitgliedschaft nicht gefunden' });

  Object.assign(membership, updates);
  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, existing, `Chapter ${chapterId}/${sparte} aktualisiert: ${kuerzel}`, req.user.kuerzel);
  res.json(existing);
});

// DELETE /api/admin/users/:kuerzel/chapter â€“ remove chapter membership
router.delete('/users/:kuerzel/chapter', async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;
  const { chapterId, sparte } = req.body;
  if (!chapterId || !sparte) return res.status(400).json({ error: 'chapterId und sparte erforderlich' });

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const r = roles?.[chapterId];
    const ok = r === 'chapteradmin' || (r?.role === 'spartenadmin' && (r.sparten||[]).includes(sparte));
    if (!ok) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  existing.chapters = (existing.chapters || []).filter(c => !(c.chapterId === chapterId && c.sparte === sparte));

  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, existing, `Chapter ${chapterId}/${sparte} entfernt: ${kuerzel}`, req.user.kuerzel);
  res.json(existing);
});

// DELETE /api/admin/users/:kuerzel â€“ delete user permanently
router.delete('/users/:kuerzel', async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins dÃ¼rfen Benutzer lÃ¶schen' });
  const kuerzel = req.params.kuerzel;
  if (!/^[a-z0-9_-]+$/i.test(kuerzel)) return res.status(400).json({ error: 'UngÃ¼ltiges KÃ¼rzel' });
  try {
    await readUser(kuerzel);
    const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
    await deleteJson(filePath);
    // Remove from credentials
    const credPath = path.join(DB_PATH, 'credentials.json');
    try {
      const creds = await readCredentials();
      delete creds[kuerzel];
      await writeJson(credPath, creds, `Credentials gelÃ¶scht: ${kuerzel}`, req.user.kuerzel);
    } catch { /* credentials cleanup optional */ }
    res.json({ message: `${kuerzel} gelÃ¶scht` });
  } catch {
    res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
});

// POST /api/admin/users/:kuerzel/reset-password â€“ Passwort zurÃ¼cksetzen
router.post('/users/:kuerzel/reset-password', async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const userChapters = (existing.chapters || []).map(c => c.chapterId);
    const hasAccess = userChapters.some(cid => roles?.[cid] === 'chapteradmin');
    if (!hasAccess) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  await deleteCredential(kuerzel, req.user.kuerzel);
  console.log(`[admin] RESET PASSWORD â€“ ${kuerzel} (by ${req.user.kuerzel})`);
  res.json({ message: `Passwort fÃ¼r ${kuerzel} zurÃ¼ckgesetzt (Initial: KÃ¼rzel)` });
});

// GET /api/admin/sysinfo – Technische Details (nur Orga-Admin)
router.get('/sysinfo', requireOrgaAdmin, async (req, res) => {
  try {
    const [users, chapters, org, log] = await Promise.all([
      readAllUsers().catch(() => []),
      readChapters().catch(() => []),
      readOrganisation().catch(() => ({})),
      gitLog(10).catch(() => []),
    ]);

    res.json({
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        uptime: Math.floor(process.uptime()),
        memUsedMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        hostname: os.hostname(),
      },
      config: {
        port: config.port,
        dataDir: config.dataDir,
        gitDbUrl: config.gitDbUrl ? config.gitDbUrl.replace(/:[^@]*@/, ':***@') : '(lokal)',
        gitDbBranch: config.gitDbBranch,
        gitSslVerify: config.gitSslVerify,
        gitDbAuthorName: config.gitDbAuthorName,
      },
      db: {
        userCount: users.length,
        chapterCount: chapters.length,
        sparteCount: chapters.reduce((n, c) => n + (c.sparten?.length || 0), 0),
        orgName: org.name || '–',
      },
      gitLog: log,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

