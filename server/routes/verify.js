const express = require('express');
const multer = require('multer');
const { generateFreigabedokument } = require('../lib/wordgen');

// Memory storage (kein Disk-Write für Uploads)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF-Dateien erlaubt'));
    }
  }
});

const router = express.Router();

// POST /api/verify/pdf – PDF hochladen und Text extrahieren
router.post('/pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine PDF-Datei übermittelt' });

  try {
    // pdf-parse direkt aus lib importieren um den Test-File-Bug zu vermeiden
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(req.file.buffer);

    // Zeilen extrahieren und leere Zeilen/Trennzeichen herausfiltern
    const lines = data.text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 1 && !/^[-=_*]{2,}$/.test(l));

    res.json({ lines, totalPages: data.numpages, rawLength: lines.length });
  } catch (e) {
    res.status(500).json({ error: `PDF-Verarbeitung fehlgeschlagen: ${e.message}` });
  }
});

// POST /api/verify/generate-word – Freigabeliste als DOCX generieren
router.post('/generate-word', async (req, res) => {
  const { eventDetails, participants } = req.body;

  if (!eventDetails || !participants) {
    return res.status(400).json({ error: 'eventDetails und participants erforderlich' });
  }

  try {
    // Spartenleiter-Info aus JWT anreichern
    eventDetails.spartenleiterKuerzel = req.user.kuerzel;
    eventDetails.spartenleiterName = req.user.name;
    eventDetails.spartenleiterVorname = req.user.vorname;

    const buffer = await generateFreigabedokument(eventDetails, participants);
    const safeDatum  = (eventDetails.datum  || 'dokument').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const safeSparte = (eventDetails.sparte || '')        .replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = `freigabe-${safeDatum}-${safeSparte}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: `Dokument-Generierung fehlgeschlagen: ${e.message}` });
  }
});

module.exports = router;
