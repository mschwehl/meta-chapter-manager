const express = require('express');
const path = require('path');
const { readChapters, readChapter, readOrganisation, writeChapter, writeJson, DB_PATH, invalidateUserToken, deleteChapterDir } = require('../lib/gitdb');
const { requireChapterAdmin, requireOrgaAdmin } = require('../middleware/roles');
const { buildTokenForUser } = require('../middleware/auth');
const { validateIds } = require('../lib/validate');

const router = express.Router();

// Collect all kuerzel that hold an admin role in the chapter (chapter-level + per-sparte)
function collectAdmins(chapter) {
  const set = new Set(chapter.admins || []);
  for (const sp of chapter.sparten || []) {
    for (const k of sp.admins || []) set.add(k);
  }
  return set;
}

// GET /api/chapters – alle Chapters (gefiltert nach Berechtigung)
router.get('/', async (req, res) => {
  const chapters = await readChapters();
  const { roles, orgaAdmin } = req.user;
  if (orgaAdmin) return res.json(chapters);
  const allowed = chapters.filter(c => !!roles?.[c.id]?.level);
  res.json(allowed);
});

// GET /api/chapters/directory – public directory for any authenticated user
// Returns basic chapter info: name, sparten (name only), admin display names
// No sensitive data, no edit-level details – just enough for "what chapters exist?"
router.get('/directory', async (req, res) => {
  const chapters = await readChapters();
  const { readUser } = require('../lib/gitdb');
  // Collect unique admin kürzels to resolve display names
  const adminSet = new Set();
  for (const ch of chapters) {
    for (const k of ch.admins || []) adminSet.add(k);
  }
  const nameMap = {};
  await Promise.all([...adminSet].map(async k => {
    try { const u = await readUser(k); nameMap[k] = `${u.vorname} ${u.name}`.trim() || k; } catch { nameMap[k] = k; }
  }));
  const directory = chapters.map(ch => ({
    id: ch.id,
    name: ch.name,
    gegruendet: ch.gegruendet || null,
    admins: (ch.admins || []).map(k => ({ kuerzel: k, displayName: nameMap[k] || k })),
    sparten: (ch.sparten || []).map(sp => ({ id: sp.id, name: sp.name || sp.id })),
  }));
  res.json(directory);
});

// GET /api/chapters/:id
router.get('/:id', validateIds({ param: 'id' }), async (req, res) => {
  try {
    const chapter = await readChapter(req.params.id);
    res.json(chapter);
  } catch {
    res.status(404).json({ error: 'Chapter nicht gefunden' });
  }
});

// POST /api/chapters – neues Chapter anlegen (nur Orga-Admin)
router.post('/', requireOrgaAdmin, validateIds({ body: 'id' }), async (req, res) => {
  const { id, name, sparten } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id und name erforderlich' });

  const chapter = { id, name, admins: [], sparten: sparten || [] };
  await writeChapter(chapter, req.user.kuerzel);

  // Chapter in Organisation eintragen
  const org = await readOrganisation();
  if (!org.chapters.includes(id)) {
    org.chapters.push(id);
    await writeJson(path.join(DB_PATH, 'organisation.json'), org, `Organisation: Chapter ${id} hinzugefügt`, req.user.kuerzel);
  }

  res.status(201).json(chapter);
});

// PUT /api/chapters/:id – Chapter bearbeiten (Chapter-Admin oder Orga-Admin)
router.put('/:id', requireChapterAdmin('id'), validateIds({ param: 'id' }), async (req, res) => {
  try {
    const chapter = await readChapter(req.params.id);
    const oldAdmins = collectAdmins(chapter);
    const allowed = ['name', 'admins', 'sparten', 'gegruendet', 'aufgeloest'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) chapter[field] = req.body[field];
    }
    // Validate all sparte IDs to prevent path traversal via filenames
    const { isValidId } = require('../lib/validate');
    for (const sp of chapter.sparten || []) {
      if (!isValidId(sp.id)) return res.status(400).json({ error: `Ungültige Sparten-ID: ${sp.id}` });
    }
    await writeChapter(chapter, req.user.kuerzel);
    // Invalidate sessions of users whose admin status changed (added or removed)
    const newAdmins = collectAdmins(chapter);
    for (const k of new Set([...oldAdmins, ...newAdmins])) {
      if (oldAdmins.has(k) !== newAdmins.has(k)) await invalidateUserToken(k);
    }
    // If the current user's own roles in this chapter may have changed (they are
    // in the old or new admin set), issue a fresh token so the client can continue
    // without a forced re-login and sees the updated roles immediately.
    const selfInvolved = oldAdmins.has(req.user.kuerzel) || newAdmins.has(req.user.kuerzel);
    const selfAuth = selfInvolved ? await buildTokenForUser(req.user.kuerzel) : null;
    const response = { ...chapter };
    if (selfAuth) response._auth = selfAuth;
    res.json(response);
  } catch {
    res.status(404).json({ error: 'Chapter nicht gefunden' });
  }
});

// DELETE /api/chapters/:id – Chapter entfernen (nur Orga-Admin)
router.delete('/:id', requireOrgaAdmin, validateIds({ param: 'id' }), async (req, res) => {
  const org = await readOrganisation();
  org.chapters = org.chapters.filter(c => c !== req.params.id);
  await writeJson(path.join(DB_PATH, 'organisation.json'), org, `Organisation: Chapter ${req.params.id} entfernt`, req.user.kuerzel);
  await deleteChapterDir(req.params.id, req.user.kuerzel);
  res.json({ message: `Chapter ${req.params.id} aus Organisation entfernt` });
});

module.exports = router;
