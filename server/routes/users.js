const express = require('express');
const { readAllUsers, readUser } = require('../lib/gitdb');

const router = express.Router();

// GET /api/users/search?q=...
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (q.length < 2) return res.json([]);

  const users = await readAllUsers();
  const results = users.filter(u =>
    u.kuerzel.toLowerCase().includes(q) ||
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.vorname && u.vorname.toLowerCase().includes(q))
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
