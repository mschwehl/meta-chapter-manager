const express = require('express');
const { readAllUsers, readUser } = require('../lib/gitdb');

const router = express.Router();

// GET /api/users/search?q=...
// Supports * as a wildcard: "ke*" matches "Keitel", "k*23" matches "k123"
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json([]);

  // Build a regex from the query: escape special chars, then replace \* with .*
  const pattern = q
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')  // escape regex metacharacters (not *)
    .replace(/\*/g, '.*');                    // * → .*
  const re = new RegExp(pattern);

  const users = await readAllUsers();
  const results = users.filter(u =>
    re.test(u.kuerzel.toLowerCase()) ||
    (u.name && re.test(u.name.toLowerCase())) ||
    (u.vorname && re.test(u.vorname.toLowerCase()))
  );
  res.json(results);
});

// GET /api/users/:kuerzel
router.get('/:kuerzel', async (req, res) => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(req.params.kuerzel)) return res.status(400).json({ error: 'Ungültiges Kürzel' });
  try {
    const user = await readUser(req.params.kuerzel);
    res.json(user);
  } catch {
    res.status(404).json({ error: 'User nicht gefunden' });
  }
});

module.exports = router;
