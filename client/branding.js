/**
 * branding.js — Default branding (committed to repo, organisation-agnostic)
 * ──────────────────────────────────────────────────────────────────────────
 * To customise for a specific deployment, create branding.custom.js next to
 * this file and override only the keys you need:
 *
 *   // branding.custom.js  (NOT committed — list in .gitignore)
 *   Object.assign(window.APP_BRANDING, {
 *     logoText:  'XYZ',
 *     orgName:   'Mein Verein',
 *     appName:   'MCM Mein Verein',
 *     copyright: 'Mein Verein © 2026',
 *     chapters: { 'chapter-id': 'Anzeigename' },
 *   });
 *
 * Load order in HTML (branding.custom.js silently ignored if absent):
 *   <script src="/branding.js"></script>
 *   <script src="/branding.custom.js" onerror="void 0"></script>
 */
window.APP_BRANDING = {
  /** Short text shown in the logo badge */
  logoText:  'MCM',

  /** Full organisation name shown as subtitle on login page etc. */
  orgName:   'Meine Organisation',

  /** Application title for browser tab and headings */
  appName:   'MetaChapterManager',

  /** Copyright line in the page footer */
  copyright: 'MetaChapterManager \u00a9 2026',

  /**
   * Chapter display names keyed by chapter-id.
   * Override in branding.custom.js with your own chapters.
   * Falls back to the raw chapter-id when a key is missing.
   */
  chapters: {},
};
