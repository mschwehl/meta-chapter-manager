const express = require('express');
const os = require('os');
const ExcelJS = require('exceljs');
const {
  readAllUsers, readUser, writeJson, deleteJson, readCredentials, writeCredential, deleteCredential, DB_PATH, readOrganisation, readChapters, gitLog
} = require('../lib/gitdb');
const { requireChapterAdmin, requireOrgaAdmin, canManageChapterSparte } = require('../middleware/roles');
const config = require('../config');
const path = require('path');
const logger = require('../lib/logger');
const { ROLE_LEVEL } = require('../../client/i18n.js');
const { validateIds } = require('../lib/validate');

const router = express.Router();

// GET /api/admin/users?chapterId=nsk
router.get('/users', async (req, res) => {
  const { chapterId } = req.query;
  const { roles, orgaAdmin, zeitstelle } = req.user;

  // OrgaAdmin / Zeitstelle: full access.
  // Chapter admins (chapteradmin / spartenadmin): only their chapters.
  // Regular members: read-only view of all org members (edit buttons are guarded in the SPA).
  const allowedChapters = (orgaAdmin || zeitstelle)
    ? null  // null = all
    : Object.entries(roles || {})
        .filter(([, r]) => r?.level === ROLE_LEVEL.CHAPTER || r?.level === ROLE_LEVEL.SPARTE)
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
router.get('/users/:kuerzel', validateIds({ param: 'kuerzel' }), async (req, res) => {
  try {
    const user = await readUser(req.params.kuerzel);
    res.json(user);
  } catch {
    res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
});

// POST /api/admin/users — create user (nur Orga-Admin)
router.post('/users', requireOrgaAdmin, validateIds({ body: 'kuerzel' }), async (req, res) => {
  const kuerzel = (req.body.kuerzel || '').trim().toLowerCase();
  const name = (req.body.name || '').trim();
  const vorname = (req.body.vorname || '').trim();
  const orgeinheit = (req.body.orgeinheit || '').trim();
  const kontakte = Array.isArray(req.body.kontakte)
    ? req.body.kontakte.map(k => ({ typ: String(k.typ || '').trim(), wert: String(k.wert || '').trim() })).filter(k => k.typ && k.wert)
    : [];
  if (!kuerzel) return res.status(400).json({ error: 'Kürzel erforderlich' });
  if (!/^[a-z][a-z0-9]{3,4}$/.test(kuerzel)) return res.status(400).json({ error: 'Kürzel muss 4–5 Zeichen haben (Buchstaben a–z und Ziffern, beginnt mit Buchstabe)' });

  // Duplikat prÃ¼fen
  try {
    await readUser(kuerzel);
    return res.status(409).json({ error: `KÃ¼rzel ${kuerzel} existiert bereits` });
  } catch { /* gut, existiert nicht */ }

  const userData = { kuerzel, name: name || '', vorname: vorname || '', orgeinheit: orgeinheit || '', kontakte, chapters: [] };
  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, userData, `User angelegt: ${kuerzel}`, req.user.kuerzel);

  // No credential entry is written â€” initial password = kuerzel (handled by auth.js fallback)

  res.status(201).json(userData);
});

// PUT /api/admin/users/:kuerzel â€“ edit basic user data (name, vorname only)
router.put('/users/:kuerzel', validateIds({ param: 'kuerzel' }), async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const userChapters = (existing.chapters || []).map(c => c.chapterId);
    const hasAccess = userChapters.some(cid => roles?.[cid]?.level === ROLE_LEVEL.CHAPTER);
    if (!hasAccess) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  const updated = { ...existing };
  if (req.body.name !== undefined) updated.name = String(req.body.name).trim();
  if (req.body.vorname !== undefined) updated.vorname = String(req.body.vorname).trim();
  if (req.body.orgeinheit !== undefined) updated.orgeinheit = String(req.body.orgeinheit).trim();
  if (req.body.kontakte !== undefined) {
    updated.kontakte = Array.isArray(req.body.kontakte)
      ? req.body.kontakte.map(k => ({ typ: String(k.typ || '').trim(), wert: String(k.wert || '').trim() })).filter(k => k.typ && k.wert)
      : [];
  }

  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, updated, `User bearbeitet: ${kuerzel}`, req.user.kuerzel);
  res.json(updated);
});

// POST /api/admin/users/:kuerzel/chapter â€“ add chapter membership
router.post('/users/:kuerzel/chapter', validateIds({ param: 'kuerzel' }, { body: 'chapterId' }, { body: 'sparte' }), async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;
  const { chapterId, sparte, eintrittsdatum, austrittsdatum, status } = req.body;
  if (!chapterId || !sparte) return res.status(400).json({ error: 'chapterId und sparte erforderlich' });

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    if (!canManageChapterSparte(req.user, chapterId, sparte)) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  if (existing.chapters?.some(c => c.chapterId === chapterId)) {
    return res.status(409).json({ error: 'Person ist bereits Mitglied in diesem Chapter' });
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
router.patch('/users/:kuerzel/chapter', validateIds({ param: 'kuerzel' }, { body: 'chapterId' }, { body: 'sparte' }), async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;
  const { chapterId, sparte, ...updates } = req.body;
  if (!chapterId || !sparte) return res.status(400).json({ error: 'chapterId und sparte erforderlich' });

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    if (!canManageChapterSparte(req.user, chapterId, sparte)) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  const membership = (existing.chapters || []).find(c => c.chapterId === chapterId && c.sparte === sparte);
  if (!membership) return res.status(404).json({ error: 'Mitgliedschaft nicht gefunden' });

  const allowedFields = ['eintrittsdatum', 'austrittsdatum', 'status', 'austrittsgrund'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) membership[field] = req.body[field];
  }
  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, existing, `Chapter ${chapterId}/${sparte} aktualisiert: ${kuerzel}`, req.user.kuerzel);
  res.json(existing);
});

// DELETE /api/admin/users/:kuerzel/chapter â€“ remove chapter membership
router.delete('/users/:kuerzel/chapter', validateIds({ param: 'kuerzel' }, { body: 'chapterId' }, { body: 'sparte' }), async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;
  const { chapterId, sparte } = req.body;
  if (!chapterId || !sparte) return res.status(400).json({ error: 'chapterId und sparte erforderlich' });

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    if (!canManageChapterSparte(req.user, chapterId, sparte)) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  existing.chapters = (existing.chapters || []).filter(c => !(c.chapterId === chapterId && c.sparte === sparte));

  const filePath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(filePath, existing, `Chapter ${chapterId}/${sparte} entfernt: ${kuerzel}`, req.user.kuerzel);
  res.json(existing);
});

// DELETE /api/admin/users/:kuerzel â€“ delete user permanently
router.delete('/users/:kuerzel', validateIds({ param: 'kuerzel' }), async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins dürfen Benutzer löschen' });
  const kuerzel = req.params.kuerzel;
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
router.post('/users/:kuerzel/reset-password', validateIds({ param: 'kuerzel' }), async (req, res) => {
  const { kuerzel } = req.params;
  const { roles, orgaAdmin } = req.user;

  let existing;
  try { existing = await readUser(kuerzel); } catch {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (!orgaAdmin) {
    const userChapters = (existing.chapters || []).map(c => c.chapterId);
    const hasAccess = userChapters.some(cid => roles?.[cid]?.level === ROLE_LEVEL.CHAPTER);
    if (!hasAccess) return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  await deleteCredential(kuerzel, req.user.kuerzel);
  logger.info('admin.password_reset', { target: kuerzel, by: req.user.kuerzel });
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

// POST /api/admin/git — Read-only git CLI for OrgaAdmin
// Whitelisted subcommands only. No writes, no pushes.
const GIT_ALLOWED = new Set(['log', 'status', 'diff', 'show', 'branch', 'remote', 'stash']);
router.post('/git', requireOrgaAdmin, async (req, res) => {
  const args = req.body.args;
  if (!Array.isArray(args) || !args.length) return res.status(400).json({ error: 'args[] erforderlich' });
  // Validate: all args must be strings, first arg is the subcommand
  if (!args.every(a => typeof a === 'string')) return res.status(400).json({ error: 'Ungültige Argumente' });
  const subcmd = args[0].replace(/^-+/, '');
  if (!GIT_ALLOWED.has(subcmd)) return res.status(403).json({ error: `Nicht erlaubt: git ${subcmd}. Erlaubt: ${[...GIT_ALLOWED].join(', ')}` });
  // Block shell metacharacters
  if (args.some(a => /[;&|`$(){}]/.test(a))) return res.status(400).json({ error: 'Ungültige Zeichen in Argumenten' });

  const { execFile } = require('child_process');
  const gitBin = 'git';
  try {
    const output = await new Promise((resolve, reject) => {
      execFile(gitBin, args, { cwd: DB_PATH, timeout: 10_000, maxBuffer: 512 * 1024 }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });
    res.json({ output });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/export/users.xlsx — Excel-Export aller Mitglieder
router.get('/export/users.xlsx', async (req, res) => {
  const { roles, orgaAdmin, zeitstelle } = req.user;
  const allowedChapters = (orgaAdmin || zeitstelle)
    ? null
    : Object.entries(roles || {})
        .filter(([, r]) => r?.level === ROLE_LEVEL.CHAPTER || r?.level === ROLE_LEVEL.SPARTE)
        .map(([id]) => id);
  if (!orgaAdmin && !zeitstelle && (!allowedChapters || !allowedChapters.length)) {
    return res.status(403).json({ error: 'Kein Zugriff' });
  }

  const [users, chapters] = await Promise.all([readAllUsers(), readChapters()]);
  const chapterNames = {};
  const sparteNames = {};
  for (const ch of chapters) {
    chapterNames[ch.id] = ch.name || ch.id;
    for (const sp of (ch.sparten || [])) sparteNames[sp.id] = sp.name || sp.id;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MetaChapterManager';
  wb.created = new Date();
  const ws = wb.addWorksheet('Mitglieder');

  ws.columns = [
    { header: 'Kürzel', key: 'kuerzel', width: 12 },
    { header: 'Nachname', key: 'name', width: 20 },
    { header: 'Vorname', key: 'vorname', width: 20 },
    { header: 'Org.einheit', key: 'orgeinheit', width: 14 },
    { header: 'Kontakte', key: 'kontakte', width: 36 },
    { header: 'Chapter', key: 'chapter', width: 20 },
    { header: 'Sparte', key: 'sparte', width: 20 },
    { header: 'Eintrittsdatum', key: 'eintritt', width: 15 },
    { header: 'Austrittsdatum', key: 'austritt', width: 15 },
    { header: 'Austrittsgrund', key: 'austrittsgrund', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  // Header styling
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  for (const u of users) {
    const memberships = (u.chapters || []).filter(c =>
      !allowedChapters || allowedChapters.includes(c.chapterId)
    );
    if (memberships.length === 0) {
      // User without (visible) memberships — still include once
      if (!allowedChapters) {
        const kontakteStr = (u.kontakte || []).map(k => `${k.typ}: ${k.wert}`).join(', ');
        ws.addRow({ kuerzel: u.kuerzel, name: u.name || '', vorname: u.vorname || '', orgeinheit: u.orgeinheit || '', kontakte: kontakteStr, chapter: '', sparte: '', eintritt: '', austritt: '', austrittsgrund: '', status: '' });
      }
    } else {
      const kontakteStr = (u.kontakte || []).map(k => `${k.typ}: ${k.wert}`).join(', ');
      for (const m of memberships) {
        ws.addRow({
          kuerzel: u.kuerzel,
          name: u.name || '',
          vorname: u.vorname || '',
          orgeinheit: u.orgeinheit || '',
          kontakte: kontakteStr,
          chapter: chapterNames[m.chapterId] || m.chapterId,
          sparte: sparteNames[m.sparte] || m.sparte,
          eintritt: m.eintrittsdatum || '',
          austritt: m.austrittsdatum || '',
          austrittsgrund: m.austrittsgrund || '',
          status: m.status || '',
        });
      }
    }
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="mitglieder.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;

