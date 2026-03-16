const express = require('express');
const { readChapters, readChapterEvents, readChapterEvent, writeChapterEvent } = require('../lib/gitdb');
const { validateIds } = require('../lib/validate');

const router = express.Router();

// Helper: list chapters accessible to the requesting user
async function getAccessibleChapters(user) {
  const chapters = await readChapters();
  if (user.orgaAdmin || user.zeitstelle) return chapters;
  return chapters.filter(c => user.roles?.[c.id]?.level);
}

// Helper: check if user can access a specific chapter
function canAccessChapter(user, chapterId) {
  if (user.orgaAdmin || user.zeitstelle) return true;
  return !!user.roles?.[chapterId]?.level;
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
router.get('/:id', validateIds({ param: 'id' }), async (req, res) => {
  const chapterId = req.query.chapterId;
  if (chapterId && !require('../lib/validate').isValidId(chapterId)) return res.status(400).json({ error: 'Ungültige chapterId' });
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
router.post('/', validateIds({ body: 'chapterId' }, 'sparte'), async (req, res) => {
  const { kuerzel } = req.user;
  const { chapterId } = req.body;
  if (!chapterId) return res.status(400).json({ error: 'chapterId erforderlich' });
  if (!canAccessChapter(req.user, chapterId)) return res.status(403).json({ error: 'Kein Zugriff auf dieses Verein' });

  // Always generate the event ID server-side to prevent path traversal
  const safeSparte = (req.body.sparte || 'xx').replace(/[^a-z0-9-]/g, '');
  const safeDatum = (req.body.datum || '').replace(/[^0-9-]/g, '') || new Date().toISOString().slice(0, 10);
  const id = `${safeDatum}-${safeSparte}-${Date.now()}`;
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
router.post('/:id/approve', validateIds({ param: 'id' }, { body: 'chapterId' }), async (req, res) => {
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
router.post('/:id/reject', validateIds({ param: 'id' }, { body: 'chapterId' }), async (req, res) => {
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

