const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');

const router = express.Router();

/**
 * Access: zeitstelle or orgaAdmin – full access to all generated documents
 */
function requireDocsAccess(req, res, next) {
  if (req.user && (req.user.zeitstelle || req.user.orgaAdmin)) return next();
  return res.status(403).json({ error: 'Zugriff verweigert – Zeitstelle oder Orga-Admin erforderlich' });
}

// GET /api/docs – list all generated documents
router.get('/', requireDocsAccess, async (req, res) => {
  try {
    const files = await fs.readdir(config.docsDir);
    const docs = [];
    for (const file of files) {
      if (!file.endsWith('.docx') && !file.endsWith('.pdf')) continue;
      const stat = await fs.stat(path.join(config.docsDir, file));
      docs.push({
        filename: file,
        size: stat.size,
        created: stat.birthtime || stat.mtime,
      });
    }
    // Newest first
    docs.sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json(docs);
  } catch {
    res.json([]);
  }
});

// GET /api/docs/download/:filename – download a specific document
router.get('/download/:filename', requireDocsAccess, async (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(config.docsDir, filename);
  try {
    await fs.access(filePath);
    res.download(filePath, filename);
  } catch {
    res.status(404).json({ error: 'Dokument nicht gefunden' });
  }
});

module.exports = router;
