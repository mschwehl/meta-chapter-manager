/**
 * i18n.js — MCM Ressource-Übersetzungen
 * Datenmodell-Keys → deutsche Anzeigestexte
 *
 * Verwendung Browser:  <script src="/i18n.js"></script>
 *                      MCM_I18N.sparte('tischtennis')  // → "Tischtennis"
 *
 * Verwendung Node.js:  const i18n = require('../client/i18n.js')
 *                      i18n.sparte('tischtennis')
 *
 * Chapter-Namen sind NICHT hier definiert — sie kommen aus
 * window.APP_BRANDING.chapters (gesetzt via branding.custom.js).
 */

const MCM_TRANSLATIONS = {

  /* ── Sparten ─────────────────────────────────────────────────── */
  sparten: {
    tischtennis:     'Tischtennis',
    fussball:        'Fußball',
    volleyball:      'Volleyball',
    handball:        'Handball',
    leichtathletik:  'Leichtathletik',
    badminton:       'Badminton',
    tennis:          'Tennis',
    schwimmen:       'Schwimmen',
    laufen:          'Laufen',
    radfahren:       'Radfahren'
  },

  /* ── Mitgliedsstatus ──────────────────────────────────────────── */
  memberStatus: {
    aktiv:    'Aktiv',
    passiv:   'Passiv'
  },

  /* ── Event-Status ─────────────────────────────────────────────── */
  eventStatus: {
    offen:        'Offen',
    freigegeben:  'Freigegeben',
    abgelehnt:    'Abgelehnt'
  },

  /* ── Rollen ───────────────────────────────────────────────────── */
  roles: {
    chapteradmin:  'Chapter-Admin',
    spartenadmin:  'Spartenadmin',
    user:          'Mitglied'
  },

  /* ── Chapters ─────────────────────────────────────────────────── */
  /* Chapter-Namen kommen zur Laufzeit aus window.APP_BRANDING.chapters  */
  /* (gesetzt in branding.custom.js). Kein Eintrag hier — org-agnostic.  */
  chapters: {},

  /* ── Datenmodell-Feldnamen ────────────────────────────────────── */
  fields: {
    kuerzel:         'Kürzel',
    name:            'Nachname',
    vorname:         'Vorname',
    sparte:          'Sparte',
    beitritt:        'Beitrittsdatum',
    status:          'Status',
    chapterId:       'Chapter',
    datum:           'Datum',
    von:             'Von',
    bis:             'Bis',
    ort:             'Ort',
    beschreibung:    'Beschreibung',
    teilnehmer:      'Teilnehmer',
    erstelltVon:     'Erstellt von',
    erstelltAm:      'Erstellt am',
    freigaben:       'Freigaben',
    kommentar:       'Kommentar',
    admins:          'Chapter-Admins',
    spartenadmins:   'Spartenadmins',
    sparten:         'Sparten'
  }
};

/* Runtime chapter data — populated via MCM_I18N.setChapters() once the API response is loaded */
let _chaptersRuntime = [];

/**
 * Hilfsfunktionen — geben den übersetzten Wert zurück,
 * oder den Original-Key wenn keine Übersetzung vorhanden.
 */
const MCM_I18N = {
  /** Call this after loading /api/chapters so chapter names come from the data model */
  setChapters(list) { _chaptersRuntime = list || []; },

  sparte:        (key) => MCM_TRANSLATIONS.sparten[key]      || key,
  memberStatus:  (key) => MCM_TRANSLATIONS.memberStatus[key] || key,
  eventStatus:   (key) => MCM_TRANSLATIONS.eventStatus[key]  || key,
  role:          (key) => MCM_TRANSLATIONS.roles[key]        || key,
  chapter:       (key) => {
    const ch = _chaptersRuntime.find(c => c.id === key);
    return (ch && ch.name) || MCM_TRANSLATIONS.chapters[key] || key;
  },
  field:         (key) => MCM_TRANSLATIONS.fields[key]       || key,

  /** Übersetzt beliebigen Key aus einem bestimmten Bereich */
  t: (namespace, key) => (MCM_TRANSLATIONS[namespace] || {})[key] || key,

  /** Alle Sparten als Options-Array [{ key, label }] */
  spartenOptions: () =>
    Object.entries(MCM_TRANSLATIONS.sparten).map(([key, label]) => ({ key, label })),

  /** Alle Mitgliedsstatus als Options-Array */
  memberStatusOptions: () =>
    Object.entries(MCM_TRANSLATIONS.memberStatus).map(([key, label]) => ({ key, label })),

  /** Alle Event-Status als Options-Array */
  eventStatusOptions: () =>
    Object.entries(MCM_TRANSLATIONS.eventStatus).map(([key, label]) => ({ key, label }))
};

/**
 * Role-level enum — single source of truth for both server and client.
 *
 *   ROLE_LEVEL.CHAPTER  Chapter-Admin: full access to all sparten in the chapter.
 *   ROLE_LEVEL.SPARTE   Spartenadmin / Spartenleiter: scoped to own sparten.
 *
 * JWT shape: { chapterId: { level: ROLE_LEVEL.*, sparten: string[] } }
 */
const ROLE_LEVEL = Object.freeze({
  CHAPTER: 'chapter',
  SPARTE:  'sparte',
});

/* ── Export: Node.js oder Browser ──────────────────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Object.assign(MCM_I18N, { ROLE_LEVEL });
} else {
  window.MCM_I18N = MCM_I18N;
  window.ROLE_LEVEL = ROLE_LEVEL;
}
