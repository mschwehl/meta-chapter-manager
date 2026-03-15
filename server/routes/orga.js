const express = require('express');
const path = require('path');
const { readOrganisation, readChapters, writeJson, DB_PATH, gitLog, invalidateUserToken } = require('../lib/gitdb');
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
    const oldOrgAdmins = new Set(org.orgAdmins || []);
    const allowed = ['name', 'orgAdmins'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) org[field] = req.body[field];
    }
    await writeJson(path.join(DB_PATH, 'organisation.json'), org, 'Organisation bearbeitet', req.user.kuerzel);
    // Invalidate sessions of users whose orgAdmin status changed
    const newOrgAdmins = new Set(org.orgAdmins || []);
    for (const k of new Set([...oldOrgAdmins, ...newOrgAdmins])) {
      if (oldOrgAdmins.has(k) !== newOrgAdmins.has(k)) await invalidateUserToken(k);
    }
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
