const express = require('express');
const path = require('path');
const { readOrganisation, readChapters, writeJson, DB_PATH, gitLog } = require('../lib/gitdb');
const { requireOrgaAdmin } = require('../middleware/roles');

const router = express.Router();

// GET /api/orga – Organisation lesen (alle eingeloggten User)
router.get('/', async (req, res) => {
  try {
    const org = await readOrganisation();
    const chapters = await readChapters();
    res.json({ ...org, chaptersDetail: chapters });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/orga – Organisation bearbeiten (nur Orga-Admins)
router.put('/', requireOrgaAdmin, async (req, res) => {
  try {
    const org = await readOrganisation();
    const allowed = ['name', 'orgAdmins'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) org[field] = req.body[field];
    }
    await writeJson(path.join(DB_PATH, 'organisation.json'), org, 'Organisation bearbeitet', req.user.kuerzel);
    res.json(org);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/orga/gitlog – Git-Protokoll (nur Orga-Admins)
router.get('/gitlog', requireOrgaAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
  const entries = await gitLog(limit);
  res.json(entries);
});

module.exports = router;
