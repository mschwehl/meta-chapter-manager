const express = require('express');
const path = require('path');
const { readChapters, readChapter, readOrganisation, writeChapter, writeJson, DB_PATH, invalidateUserToken } = require('../lib/gitdb');
const { requireChapterAdmin, requireOrgaAdmin } = require('../middleware/roles');

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

// GET /api/chapters/:id
router.get('/:id', async (req, res) => {
  try {
    const chapter = await readChapter(req.params.id);
    res.json(chapter);
  } catch {
    res.status(404).json({ error: 'Chapter nicht gefunden' });
  }
});

// POST /api/chapters – neues Chapter anlegen (nur Orga-Admin)
router.post('/', requireOrgaAdmin, async (req, res) => {
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
router.put('/:id', requireChapterAdmin('id'), async (req, res) => {
  try {
    const chapter = await readChapter(req.params.id);
    const oldAdmins = collectAdmins(chapter);
    const allowed = ['name', 'admins', 'sparten', 'gegruendet'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) chapter[field] = req.body[field];
    }
    await writeChapter(chapter, req.user.kuerzel);
    // Invalidate sessions of users whose admin status changed (added or removed)
    const newAdmins = collectAdmins(chapter);
    for (const k of new Set([...oldAdmins, ...newAdmins])) {
      if (oldAdmins.has(k) !== newAdmins.has(k)) await invalidateUserToken(k);
    }
    res.json(chapter);
  } catch {
    res.status(404).json({ error: 'Chapter nicht gefunden' });
  }
});

// DELETE /api/chapters/:id – Chapter entfernen (nur Orga-Admin)
router.delete('/:id', requireOrgaAdmin, async (req, res) => {
  const org = await readOrganisation();
  org.chapters = org.chapters.filter(c => c !== req.params.id);
  await writeJson(path.join(DB_PATH, 'organisation.json'), org, `Organisation: Chapter ${req.params.id} entfernt`, req.user.kuerzel);
  res.json({ message: `Chapter ${req.params.id} aus Organisation entfernt` });
});

module.exports = router;
