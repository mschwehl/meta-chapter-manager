const express = require('express');
const { readChapters, readChapterEvents, readChapterEvent, writeChapterEvent } = require('../lib/gitdb');

const router = express.Router();

// Helper: list chapters accessible to the requesting user
async function getAccessibleChapters(user) {
  const chapters = await readChapters();
  if (user.orgaAdmin || user.zeitstelle) return chapters;
  return chapters.filter(c =>
    user.roles?.[c.id] === 'chapteradmin' || user.roles?.[c.id]?.role === 'spartenadmin'
  );
}

// Helper: check if user can access a specific chapter
function canAccessChapter(user, chapterId) {
  if (user.orgaAdmin || user.zeitstelle) return true;
  const r = user.roles?.[chapterId];
  return r === 'chapteradmin' || r?.role === 'spartenadmin';
}

// GET /api/events?chapterId=nsk&sparte=tischtennis&status=offen
router.get('/', async (req, res) => {
  const { chapterId, sparte, status } = req.query;
  let events = [];

  if (chapterId) {
    events = await readChapterEvents(chapterId);
  } else {
    const chapters = await getAccessibleChapters(req.user);
    const results = await Promise.all(chapters.map(c => readChapterEvents(c.id)));
    events = results.flat();
  }

  if (sparte) events = events.filter(e => e.sparte === sparte);
  if (status) events = events.filter(e => e.status === status);
  events.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
  res.json(events);
});

// GET /api/events/:id?chapterId=nsk
router.get('/:id', async (req, res) => {
  const chapterId = req.query.chapterId;
  try {
    if (chapterId) {
      return res.json(await readChapterEvent(chapterId, req.params.id));
    }
    // Scan all accessible chapters
    const chapters = await getAccessibleChapters(req.user);
    for (const ch of chapters) {
      try { return res.json(await readChapterEvent(ch.id, req.params.id)); } catch {}
    }
    res.status(404).json({ error: 'Event nicht gefunden' });
  } catch {
    res.status(404).json({ error: 'Event nicht gefunden' });
  }
});

// POST /api/events â€“ neues Event anlegen
router.post('/', async (req, res) => {
  const { kuerzel } = req.user;
  const { chapterId } = req.body;
  if (!chapterId) return res.status(400).json({ error: 'chapterId erforderlich' });
  if (!canAccessChapter(req.user, chapterId)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Verein' });

  const id = req.body.id || `${req.body.datum || Date.now()}-${req.body.sparte || 'xx'}-${Date.now()}`;
  const event = {
    ...req.body,
    id,
    erstelltVon: kuerzel,
    erstelltAm: new Date().toISOString(),
    status: req.body.status || 'offen',
    freigaben: req.body.freigaben || []
  };

  try {
    await writeChapterEvent(chapterId, event, kuerzel);
    res.status(201).json(event);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/events/:id/approve â€“ freigeben
router.post('/:id/approve', async (req, res) => {
  const { kuerzel } = req.user;
  const { chapterId } = req.body;
  if (!chapterId) return res.status(400).json({ error: 'chapterId erforderlich' });
  if (!canAccessChapter(req.user, chapterId)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Verein' });
  try {
    const event = await readChapterEvent(chapterId, req.params.id);
    event.status = 'freigegeben';
    event.freigaben = event.freigaben || [];
    event.freigaben.push({ von: kuerzel, am: new Date().toISOString(), kommentar: req.body.kommentar || '' });
    await writeChapterEvent(chapterId, event, kuerzel);
    res.json(event);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/events/:id/reject â€“ ablehnen
router.post('/:id/reject', async (req, res) => {
  const { kuerzel } = req.user;
  const { chapterId } = req.body;
  if (!chapterId) return res.status(400).json({ error: 'chapterId erforderlich' });
  if (!canAccessChapter(req.user, chapterId)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Verein' });
  try {
    const event = await readChapterEvent(chapterId, req.params.id);
    event.status = 'abgelehnt';
    event.freigaben = event.freigaben || [];
    event.freigaben.push({ von: kuerzel, am: new Date().toISOString(), kommentar: req.body.kommentar || '' });
    await writeChapterEvent(chapterId, event, kuerzel);
    res.json(event);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

