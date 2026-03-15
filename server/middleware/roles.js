const { ROLE_LEVEL } = require('../../client/i18n.js');

/**
 * Returns true if the user may manage a specific chapterId/sparte combination.
 * orgaAdmin and zeitstelle always pass.
 * level CHAPTER passes for any sparte in that chapter.
 * level SPARTE  passes only when the user is admin for that exact sparte.
 * If sparte is omitted, any chapter-level or sparte-level role in that chapter suffices.
 */
function canManageChapterSparte(user, chapterId, sparte) {
  if (user.orgaAdmin || user.zeitstelle) return true;
  const r = user.roles?.[chapterId];
  if (!r) return false;
  if (r.level === ROLE_LEVEL.CHAPTER) return true;
  if (r.level === ROLE_LEVEL.SPARTE) return !sparte || r.sparten.includes(sparte);
  return false;
}

/**
 * Middleware: nur für Chapter-Admins des angegebenen Chapters
 * oder Orga-Admins / Zeitstelle (haben Zugriff auf alle Chapters)
 */
function requireChapterAdmin(chapterParam = 'chapterId') {
  return (req, res, next) => {
    const { roles, orgaAdmin, zeitstelle } = req.user;
    if (orgaAdmin || zeitstelle) return next();
    const chapterId = req.params[chapterParam] || req.body[chapterParam] || req.query[chapterParam];
    if (chapterId && roles?.[chapterId]?.level === ROLE_LEVEL.CHAPTER) return next();
    if (!chapterId && Object.values(roles || {}).some(r => r.level === ROLE_LEVEL.CHAPTER)) return next();
    return res.status(403).json({ error: 'Zugriff verweigert – Chapter-Admin-Berechtigung erforderlich' });
  };
}

/**
 * Middleware: nur für Orga-Admins
 */
function requireOrgaAdmin(req, res, next) {
  if (req.user && req.user.orgaAdmin) return next();
  return res.status(403).json({ error: 'Zugriff verweigert – Organisations-Admin-Berechtigung erforderlich' });
}

/**
 * Middleware: Zeitstelle oder Orga-Admin (read-all Zugriff)
 */
function requireZeitstelleOrAdmin(req, res, next) {
  if (req.user && (req.user.zeitstelle || req.user.orgaAdmin)) return next();
  return res.status(403).json({ error: 'Zugriff verweigert – Zeitstelle oder Admin-Berechtigung erforderlich' });
}

module.exports = { requireChapterAdmin, requireOrgaAdmin, requireZeitstelleOrAdmin, canManageChapterSparte };
