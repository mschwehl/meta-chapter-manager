const express = require('express');
const path = require('path');
const { DB_PATH, writeJson, deleteJson, readUser, readChapters } = require('../lib/gitdb');
const logger = require('../lib/logger');
const fs = require('fs').promises;
const { ROLE_LEVEL } = require('../../client/i18n.js');

const router = express.Router();

const REQUESTS_DIR = () => path.join(DB_PATH, 'requests');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function chapterAdminChapterIds(user = {}) {
  return Object.entries(user.roles || {})
    .filter(([, role]) => role?.level === ROLE_LEVEL.CHAPTER)
    .map(([chapterId]) => chapterId);
}

function canModerateRequest(user = {}, requestData = {}) {
  if (user.orgaAdmin) return true;
  const allowed = new Set(chapterAdminChapterIds(user));
  return !!requestData.chapterId && allowed.has(requestData.chapterId);
}

function mayModerateAnyRequest(user = {}) {
  return !!user.orgaAdmin || chapterAdminChapterIds(user).length > 0;
}

async function readAllRequests() {
  const dir = REQUESTS_DIR();
  try {
    const files = await fs.readdir(dir);
    const requests = [];
    for (const file of files) {
      if (file.endsWith('-request.json')) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          requests.push(JSON.parse(content));
        } catch { /* skip broken file */ }
      }
    }
    return requests.sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || ''));
  } catch {
    return [];
  }
}

// GET /api/auth/register/options  (public – no JWT)
router.get('/register/options', async (_req, res) => {
  try {
    const chapters = await readChapters();
    const options = chapters.map(ch => ({
      id: ch.id,
      name: ch.name || ch.id,
      sparten: (ch.sparten || [])
        .filter(sp => !sp.datumStillgelegt)
        .map(sp => ({ id: sp.id, name: sp.name || sp.id })),
    }));
    res.json(options);
  } catch {
    res.json([]);
  }
});

// POST /api/auth/register  (public – no JWT)
router.post('/register', async (req, res) => {
  const kuerzel = (req.body.kuerzel || '').trim().toLowerCase();
  const name = (req.body.name || '').trim();
  const vorname = (req.body.vorname || '').trim();
  const businessMail = (req.body.businessMail || '').trim().toLowerCase();
  const chapterId = (req.body.chapterId || '').trim();
  const sparte = (req.body.sparte || '').trim();
  const bemerkung = (req.body.bemerkung || '').trim();
  if (!kuerzel || !name || !vorname || !businessMail) {
    return res.status(400).json({ error: 'Kürzel, Name, Vorname und Business-Mail erforderlich' });
  }
  if (!/^[a-z0-9]+$/.test(kuerzel)) {
    return res.status(400).json({ error: 'Kürzel darf nur Kleinbuchstaben und Ziffern enthalten' });
  }
  if (!EMAIL_PATTERN.test(businessMail)) {
    return res.status(400).json({ error: 'Business-Mail ist ungültig' });
  }
  if (kuerzel.length > 30) {
    return res.status(400).json({ error: 'Kürzel zu lang' });
  }

  if ((chapterId && !sparte) || (!chapterId && sparte)) {
    return res.status(400).json({ error: 'Bitte Chapter und Sparte gemeinsam angeben' });
  }

  if (chapterId && sparte) {
    const chapters = await readChapters();
    const chapter = chapters.find(ch => ch.id === chapterId);
    if (!chapter) return res.status(400).json({ error: `Chapter ${chapterId} existiert nicht` });
    const sparteExists = (chapter.sparten || []).some(sp => sp.id === sparte && !sp.datumStillgelegt);
    if (!sparteExists) return res.status(400).json({ error: `Sparte ${sparte} in Chapter ${chapterId} nicht gefunden` });
  }

  // Check if user already exists
  try {
    await readUser(kuerzel);
    return res.status(409).json({ error: `Kürzel ${kuerzel} ist bereits registriert` });
  } catch { /* good – doesn't exist */ }

  // Check if request already pending
  const reqPath = path.join(REQUESTS_DIR(), `${kuerzel}-request.json`);
  try {
    await fs.access(reqPath);
    return res.status(409).json({ error: `Anfrage für ${kuerzel} ist bereits vorhanden` });
  } catch { /* good – no pending request */ }

  const requestData = {
    kuerzel,
    name,
    vorname,
    businessMail,
    chapterId: chapterId || '',
    sparte: sparte || '',
    bemerkung: bemerkung || '',
    requestedAt: new Date().toISOString()
  };

  await writeJson(reqPath, requestData, `Registrierungsanfrage: ${kuerzel}`, 'system');
  logger.info('register.request', { kuerzel, name, vorname, chapterId, sparte });
  res.status(201).json({ message: 'Anfrage eingegangen' });
});

// GET /api/admin/requests  (orgaAdmin and chapter-admin)
router.get('/', async (req, res) => {
  if (!mayModerateAnyRequest(req.user)) return res.status(403).json({ error: 'Nur Orga-Admins oder Verband-Admins' });
  const all = await readAllRequests();
  if (req.user.orgaAdmin) return res.json(all);
  const allowed = new Set(chapterAdminChapterIds(req.user));
  res.json(all.filter(rq => rq.chapterId && allowed.has(rq.chapterId)));
});

// POST /api/admin/requests/:kuerzel/approve  (orgaAdmin and chapter-admin)
router.post('/:kuerzel/approve', async (req, res) => {
  if (!mayModerateAnyRequest(req.user)) return res.status(403).json({ error: 'Nur Orga-Admins oder Verband-Admins' });
  const kuerzel = String(req.params.kuerzel || '').trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(kuerzel)) return res.status(400).json({ error: 'Ungültiges Kürzel' });

  const reqPath = path.join(REQUESTS_DIR(), `${kuerzel}-request.json`);
  let requestData;
  try {
    const content = await fs.readFile(reqPath, 'utf-8');
    requestData = JSON.parse(content);
  } catch {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  if (!canModerateRequest(req.user, requestData)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    await readUser(kuerzel);
    return res.status(409).json({ error: `Kürzel ${kuerzel} ist bereits registriert` });
  } catch { /* user does not exist yet */ }

  const kontakte = requestData.businessMail
    ? [{ typ: 'email', wert: requestData.businessMail, attribut: 'business' }]
    : [];

  // Create user file
  const userData = {
    kuerzel,
    name: requestData.name,
    vorname: requestData.vorname,
    kontakte,
    chapters: []
  };
  const userPath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(userPath, userData, `User genehmigt: ${kuerzel}`, req.user.kuerzel);

  // Delete the request file
  await deleteJson(reqPath);

  logger.info('register.approved', { kuerzel, by: req.user.kuerzel });
  res.json({ message: `${kuerzel} genehmigt und angelegt`, user: userData });
});

// DELETE /api/admin/requests/:kuerzel  (orgaAdmin and chapter-admin)
router.delete('/:kuerzel', async (req, res) => {
  if (!mayModerateAnyRequest(req.user)) return res.status(403).json({ error: 'Nur Orga-Admins oder Verband-Admins' });
  const kuerzel = String(req.params.kuerzel || '').trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(kuerzel)) return res.status(400).json({ error: 'Ungültiges Kürzel' });

  const reqPath = path.join(REQUESTS_DIR(), `${kuerzel}-request.json`);
  let requestData;
  try {
    const content = await fs.readFile(reqPath, 'utf-8');
    requestData = JSON.parse(content);
  } catch {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  if (!canModerateRequest(req.user, requestData)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  try {
    await deleteJson(reqPath);
    logger.info('register.rejected', { kuerzel, by: req.user.kuerzel });
    res.json({ message: `Anfrage für ${kuerzel} abgelehnt` });
  } catch {
    res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }
});

module.exports = router;
