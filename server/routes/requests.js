const express = require('express');
const path = require('path');
const { DB_PATH, writeJson, deleteJson, readUser } = require('../lib/gitdb');
const logger = require('../lib/logger');
const fs = require('fs').promises;

const router = express.Router();

const REQUESTS_DIR = () => path.join(DB_PATH, 'requests');

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

// POST /api/auth/register  (public – no JWT)
router.post('/register', async (req, res) => {
  const kuerzel = (req.body.kuerzel || '').trim().toLowerCase();
  const name = (req.body.name || '').trim();
  const vorname = (req.body.vorname || '').trim();
  const bemerkung = (req.body.bemerkung || '').trim();
  if (!kuerzel || !name || !vorname) {
    return res.status(400).json({ error: 'Kürzel, Name und Vorname erforderlich' });
  }
  if (!/^[a-z0-9]+$/.test(kuerzel)) {
    return res.status(400).json({ error: 'Kürzel darf nur Kleinbuchstaben und Ziffern enthalten' });
  }
  if (kuerzel.length > 30) {
    return res.status(400).json({ error: 'Kürzel zu lang' });
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
    bemerkung: bemerkung || '',
    requestedAt: new Date().toISOString()
  };

  await writeJson(reqPath, requestData, `Registrierungsanfrage: ${kuerzel}`, 'system');
  logger.info('register.request', { kuerzel, name, vorname });
  res.status(201).json({ message: 'Anfrage eingegangen' });
});

// GET /api/admin/requests  (orgaAdmin only)
router.get('/', async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins' });
  const requests = await readAllRequests();
  res.json(requests);
});

// POST /api/admin/requests/:kuerzel/approve  (orgaAdmin only)
router.post('/:kuerzel/approve', async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins' });
  const { kuerzel } = req.params;
  if (!/^[a-z0-9]+$/.test(kuerzel)) return res.status(400).json({ error: 'Ungültiges Kürzel' });

  const reqPath = path.join(REQUESTS_DIR(), `${kuerzel}-request.json`);
  let requestData;
  try {
    const content = await fs.readFile(reqPath, 'utf-8');
    requestData = JSON.parse(content);
  } catch {
    return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }

  // Create user file
  const userData = {
    kuerzel: requestData.kuerzel,
    name: requestData.name,
    vorname: requestData.vorname,
    kontakte: [],
    chapters: []
  };
  const userPath = path.join(DB_PATH, 'user', `${kuerzel}.json`);
  await writeJson(userPath, userData, `User genehmigt: ${kuerzel}`, req.user.kuerzel);

  // Delete the request file
  await deleteJson(reqPath);

  logger.info('register.approved', { kuerzel, by: req.user.kuerzel });
  res.json({ message: `${kuerzel} genehmigt und angelegt`, user: userData });
});

// DELETE /api/admin/requests/:kuerzel  (orgaAdmin only)
router.delete('/:kuerzel', async (req, res) => {
  if (!req.user.orgaAdmin) return res.status(403).json({ error: 'Nur Orga-Admins' });
  const { kuerzel } = req.params;
  if (!/^[a-z0-9]+$/.test(kuerzel)) return res.status(400).json({ error: 'Ungültiges Kürzel' });

  const reqPath = path.join(REQUESTS_DIR(), `${kuerzel}-request.json`);
  try {
    await deleteJson(reqPath);
    logger.info('register.rejected', { kuerzel, by: req.user.kuerzel });
    res.json({ message: `Anfrage für ${kuerzel} abgelehnt` });
  } catch {
    res.status(404).json({ error: 'Anfrage nicht gefunden' });
  }
});

module.exports = router;
