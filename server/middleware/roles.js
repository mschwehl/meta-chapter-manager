/**
 * Middleware: nur für Superadmins des angegebenen Chapters
 * oder Orga-Admins / Zeitstelle (haben Zugriff auf alle Chapters)
 */
function requireChapterAdmin(chapterParam = 'chapterId') {
  return (req, res, next) => {
    const { roles, orgaAdmin, zeitstelle } = req.user;
    if (orgaAdmin || zeitstelle) return next();
    const chapterId = req.params[chapterParam] || req.body[chapterParam] || req.query[chapterParam];
    if (chapterId && roles && roles[chapterId] === 'chapteradmin') return next();
    // No specific chapter required → any chapter-admin is allowed (e.g. global user creation)
    if (!chapterId && roles && Object.values(roles).some(r => r === 'chapteradmin')) return next();
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

module.exports = { requireChapterAdmin, requireOrgaAdmin, requireZeitstelleOrAdmin };
