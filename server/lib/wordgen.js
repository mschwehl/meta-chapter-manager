/**
 * wordgen.js — Freigabeliste DOCX generator
 *
 * Default: generates a clean, generic document from scratch using the `docx`
 *          package — no template file required, safe to commit.
 *
 * Override: if a file matching `*branding*` exists in server/template/, it is used
 *           instead via pizzip XML manipulation (company-specific styling).
 *           That file is gitignored and never pushed to DockerHub.
 */
const path = require('path');
const fs   = require('fs');
const fsp  = require('fs').promises;

const TEMPLATE_DIR  = path.join(__dirname, '../template');
let _brandingTemplate = null;
let _brandingResolved = false;

async function getBrandingTemplate() {
  if (_brandingResolved) return _brandingTemplate;
  try {
    const files = await fsp.readdir(TEMPLATE_DIR);
    const hit = files.find(f => f.toLowerCase().includes('branding') && f.endsWith('.docx'));
    _brandingTemplate = hit ? path.join(TEMPLATE_DIR, hit) : null;
  } catch { _brandingTemplate = null; }
  _brandingResolved = true;
  return _brandingTemplate;
}

// ─── Generic generator (docx package) ────────────────────────────────────────
async function generateGeneric(eventDetails, participants) {
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, BorderStyle, HeadingLevel,
    VerticalAlign, convertInchesToTwip
  } = require('docx');

  const leitung = [
    eventDetails.spartenleiterVorname,
    eventDetails.spartenleiterName,
    eventDetails.spartenleiterKuerzel ? `(${eventDetails.spartenleiterKuerzel})` : ''
  ].filter(Boolean).join(' ');

  const datumZeit = `${eventDetails.datum || '–'}, ${eventDetails.von || ''} – ${eventDetails.bis || ''}`;

  // ── Meta rows ──────────────────────────────────────────────────────────────
  function metaRow(label, value) {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: value || '–', size: 20 })] })],
        }),
      ],
    });
  }

  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      metaRow('Organisation',       eventDetails.chapterId || '–'),
      metaRow('Sportart',           eventDetails.sparte    || '–'),
      metaRow('Leitung',            leitung                || '–'),
      metaRow('Datum und Uhrzeit',  datumZeit),
      metaRow('Ort',                eventDetails.ort       || '–'),
    ],
  });

  // ── Participant table ──────────────────────────────────────────────────────
  const noBorder = { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' };
  const cellBorder = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

  function headerCell(text, widthPct) {
    return new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      shading: { fill: '1E3A5F' },
      borders: cellBorder,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 18 })],
      })],
    });
  }

  function dataCell(text, widthPct, align = AlignmentType.LEFT) {
    return new TableCell({
      width: { size: widthPct, type: WidthType.PERCENTAGE },
      borders: cellBorder,
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        alignment: align,
        children: [new TextRun({ text: text || '', size: 20 })],
      })],
    });
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('Nr.',         5),
      headerCell('Name',        35),
      headerCell('Kürzel',      12),
      headerCell('Unterschrift',28),
      headerCell('Bemerkung',   20),
    ],
  });

  const dataRows = (participants || []).map((p, i) => new TableRow({
    children: [
      dataCell(String(i + 1),                                   5,  AlignmentType.CENTER),
      dataCell([p.name, p.vorname].filter(Boolean).join(', '), 35),
      dataCell(p.kuerzel || '',                                 12, AlignmentType.CENTER),
      dataCell('',                                              28),
      dataCell('',                                              20),
    ],
  }));

  // Pad to at least 20 rows
  const MIN_ROWS = 20;
  for (let i = dataRows.length; i < MIN_ROWS; i++) {
    dataRows.push(new TableRow({
      children: [
        dataCell(String(i + 1),  5,  AlignmentType.CENTER),
        dataCell('',             35),
        dataCell('',             12),
        dataCell('',             28),
        dataCell('',             20),
      ],
    }));
  }

  const participantTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(0.75), bottom: convertInchesToTwip(0.75), left: convertInchesToTwip(0.9), right: convertInchesToTwip(0.9) } } },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 240 },
          children: [new TextRun({ text: 'Freigabeliste / Unterschriftenliste', bold: true, size: 28 })],
        }),
        metaTable,
        new Paragraph({ spacing: { before: 240, after: 240 }, children: [new TextRun('')] }),
        participantTable,
        new Paragraph({
          spacing: { before: 480 },
          children: [new TextRun({ text: `Erstellt: ${new Date().toLocaleDateString('de-DE')}`, size: 16, color: '999999' })],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}

// ─── Branding template override (pizzip XML fill) ─────────────────────────────────
function escapeXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function textOf(xml) {
  return (xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map(m => m.replace(/<[^>]+>/g, '')).join('');
}
function fillCell(tcXml, newText) {
  const tcOpen   = (tcXml.match(/^<w:tc(\s[^>]*)?>/) || ['<w:tc>'])[0];
  const tcPr     = (tcXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) || [''])[0];
  const paraOpen = (tcXml.match(/<w:p\b[^>]*>/) || ['<w:p>'])[0];
  const pPr      = (tcXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  return `${tcOpen}${tcPr}${paraOpen}${pPr}<w:r><w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r></w:p></w:tc>`;
}

async function generateFromTemplate(templatePath, eventDetails, participants) {
  const PizZip = require('pizzip');
  const buf = await fsp.readFile(templatePath);
  const zip = new PizZip(buf);
  let xml = zip.files['word/document.xml'].asText();

  const leitung = [
    eventDetails.spartenleiterVorname,
    eventDetails.spartenleiterName,
    eventDetails.spartenleiterKuerzel ? `(${eventDetails.spartenleiterKuerzel})` : ''
  ].filter(Boolean).join(' ');

  const datumZeit = `${eventDetails.datum || ''}, ${eventDetails.von || ''} – ${eventDetails.bis || ''}`;

  xml = xml.replace(/Organisation[^:]*: _+/, `Organisation: ${escapeXml(eventDetails.chapterId || '')}`);
  xml = xml.replace(/<w:r><w:t>Sportart: _+<\/w:t><\/w:r>(<w:r[^>]*><w:t>_+<\/w:t><\/w:r>)*/, `<w:r><w:t xml:space="preserve">Sportart: ${escapeXml(eventDetails.sparte || '')}</w:t></w:r>`);
  xml = xml.replace(/<w:r><w:t>Leitung<\/w:t><\/w:r>(<w:r[^>]*><w:t[^>]*>[^<]*<\/w:t><\/w:r>){1,5}/, `<w:r><w:t xml:space="preserve">Leitung: ${escapeXml(leitung)}</w:t></w:r>`);
  xml = xml.replace(/<w:r><w:t>Datum<\/w:t><\/w:r>(<w:r[^>]*><w:t[^>]*>[^<]*<\/w:t><\/w:r>){1,8}/, `<w:r><w:t xml:space="preserve">Datum und Uhrzeit (von bis): ${escapeXml(datumZeit)}</w:t></w:r>`);

  const trParts = xml.split(/(?=<w:tr\b)/);
  const result = trParts.map(part => {
    if (!part.startsWith('<w:tr')) return part;
    const tcParts = part.split(/(?=<w:tc\b)/);
    if (tcParts.length < 3) return part;
    const nrText = textOf(tcParts[1]).trim();
    const rowNum = parseInt(nrText, 10);
    if (isNaN(rowNum) || String(rowNum) !== nrText) return part;
    const p = (participants || [])[rowNum - 1];
    if (!p) return part;
    tcParts[2] = fillCell(tcParts[2], [p.name, p.vorname].filter(Boolean).join(', '));
    return tcParts.join('');
  });

  zip.file('word/document.xml', result.join(''));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ─── Public API ───────────────────────────────────────────────────────────────
async function generateFreigabedokument(eventDetails, participants) {
  const brandingTemplate = await getBrandingTemplate();
  if (brandingTemplate) {
    return generateFromTemplate(brandingTemplate, eventDetails, participants);
  }
  return generateGeneric(eventDetails, participants);
}

module.exports = { generateFreigabedokument };

