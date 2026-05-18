const express = require('express');
const path = require('path');
const { readOrganisation, readChapters, readAllUsers, writeJson, DB_PATH, gitLog, gitCommitAndPush, invalidateUserToken, getEffectiveSyncStrategy, SYNC_STRATEGY } = require('../lib/gitdb');
const { requireOrgaAdmin } = require('../middleware/roles');

const router = express.Router();
const VALID_SYNC_STRATEGIES = new Set(Object.values(SYNC_STRATEGY));
const KUERZEL_PATTERN = /^[a-z][a-z0-9]{3,4}$/;

const EMAIL_ATTRIBUTES = new Set(['private', 'business']);
function normalizeKontakte(kontakte) {
  if (!Array.isArray(kontakte)) return [];
  return kontakte
    .map((k = {}) => {
      const typ = String(k.typ || '').trim();
      const wert = String(k.wert || '').trim();
      if (!typ || !wert) return null;
      const kontakt = { typ, wert };
      if (typ === 'email') {
        const attribut = String(k.attribut || '').trim().toLowerCase();
        if (EMAIL_ATTRIBUTES.has(attribut)) kontakt.attribut = attribut;
      }
      return kontakt;
    })
    .filter(Boolean);
}

// GET /api/orga – Organisation lesen (alle eingeloggten User)
router.get('/', async (req, res) => {
  try {
    const org = await readOrganisation();
    const chapters = await readChapters();
    const effectiveSyncStrategy = await getEffectiveSyncStrategy();
    res.json({ ...org, effectiveSyncStrategy, chaptersDetail: chapters });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/orga – Organisation bearbeiten (nur Orga-Admins)
router.put('/', requireOrgaAdmin, async (req, res) => {
  try {
    const org = await readOrganisation();
    const oldOrgAdmins = new Set(org.orgAdmins || []);
    const allowed = ['name', 'orgAdmins', 'gitSyncStrategy'];

    if (req.body.gitSyncStrategy !== undefined) {
      const strategy = String(req.body.gitSyncStrategy || '').trim().toLowerCase();
      if (!VALID_SYNC_STRATEGIES.has(strategy)) {
        return res.status(400).json({ error: `Ungültige Sync-Strategie: ${req.body.gitSyncStrategy}` });
      }
      req.body.gitSyncStrategy = strategy;
    }

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
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '100', 10) || 100, 500));
  const entries = await gitLog(limit);
  res.json(entries);
});

// POST /api/orga/usersyncv — Merge users from uploaded file payload by kuerzel (Org-Admin only)
router.post('/usersyncv', requireOrgaAdmin, async (req, res) => {
  const rows = Array.isArray(req.body?.users) ? req.body.users : [];
  const dryRun = !!req.body?.dryRun;
  if (!rows.length) return res.status(400).json({ error: 'users[] erforderlich' });

  const existing = await readAllUsers().catch(() => []);
  const existingByKuerzel = new Map(existing.map(u => [String(u.kuerzel || '').toLowerCase(), u]));
  const seen = new Set();
  const result = {
    dryRun,
    total: rows.length,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const line = i + 1;
    const row = rows[i] || {};
    const kuerzel = String(row.kuerzel || '').trim().toLowerCase();
    if (!kuerzel) {
      result.errors.push(`Zeile ${line}: Kürzel fehlt`);
      continue;
    }
    if (!KUERZEL_PATTERN.test(kuerzel)) {
      result.errors.push(`Zeile ${line}: Ungültiges Kürzel ${kuerzel}`);
      continue;
    }
    if (seen.has(kuerzel)) {
      result.errors.push(`Zeile ${line}: Kürzel ${kuerzel} ist doppelt in der Datei`);
      continue;
    }
    seen.add(kuerzel);

    const incoming = {
      kuerzel,
      vorname: String(row.vorname || '').trim(),
      name: String(row.name || '').trim(),
      orgeinheit: String(row.orgeinheit || '').trim(),
      kontakte: normalizeKontakte(row.kontakte),
    };

    try {
      const existingUser = existingByKuerzel.get(kuerzel);
      if (!existingUser) {
        result.processed++;
        result.created++;
        if (!dryRun) {
          const newUser = {
            kuerzel,
            vorname: incoming.vorname,
            name: incoming.name,
            orgeinheit: incoming.orgeinheit,
            kontakte: incoming.kontakte,
            chapters: [],
          };
          await writeJson(
            path.join(DB_PATH, 'user', `${kuerzel}.json`),
            newUser,
            `UserSyncV: Benutzer angelegt ${kuerzel}`,
            req.user.kuerzel,
            { skipActionPush: true }
          );
          existingByKuerzel.set(kuerzel, newUser);
        }
        continue;
      }

      const mergedUser = { ...existingUser };
      let changed = false;
      if (incoming.vorname && incoming.vorname !== String(existingUser.vorname || '')) {
        mergedUser.vorname = incoming.vorname;
        changed = true;
      }
      if (incoming.name && incoming.name !== String(existingUser.name || '')) {
        mergedUser.name = incoming.name;
        changed = true;
      }
      if (incoming.orgeinheit && incoming.orgeinheit !== String(existingUser.orgeinheit || '')) {
        mergedUser.orgeinheit = incoming.orgeinheit;
        changed = true;
      }
      if (incoming.kontakte.length) {
        const oldKontakte = JSON.stringify(existingUser.kontakte || []);
        const newKontakte = JSON.stringify(incoming.kontakte);
        if (oldKontakte !== newKontakte) {
          mergedUser.kontakte = incoming.kontakte;
          changed = true;
        }
      }

      result.processed++;
      if (!changed) {
        result.unchanged++;
        continue;
      }

      result.updated++;
      if (!dryRun) {
        await writeJson(
          path.join(DB_PATH, 'user', `${kuerzel}.json`),
          mergedUser,
          `UserSyncV: Benutzer aktualisiert ${kuerzel}`,
          req.user.kuerzel,
          { skipActionPush: true }
        );
        existingByKuerzel.set(kuerzel, mergedUser);
      }
    } catch (e) {
      result.errors.push(`Zeile ${line}: ${e.message}`);
    }
  }

  result.failed = result.errors.length;

  if (!dryRun && (result.created > 0 || result.updated > 0)) {
    await gitCommitAndPush();
  }

  res.json(result);
});

module.exports = router;
