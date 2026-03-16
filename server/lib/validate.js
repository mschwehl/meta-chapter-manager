/**
 * validate.js — shared ID plausibility helpers
 *
 * Valid ID format: 1–64 characters, lowercase letters (a-z), digits (0-9) and hyphens (-).
 * Must start with a letter or digit (not a hyphen).
 * No spaces, no uppercase, no special characters.
 * Examples: "nsk", "sv-test", "tischtennis", "chapter-01"
 */

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Returns true when s is a valid ID string.
 */
function isValidId(s) {
  return typeof s === 'string' && ID_RE.test(s);
}

/**
 * Express middleware factory.
 * Validates one or more named fields from req.body or req.params.
 *
 * Usage:
 *   router.post('/', validateIds('id', 'chapterId'), handler)
 *   router.put('/:chapterId', validateIds({ param: 'chapterId' }), handler)
 *
 * Each argument can be:
 *   - a string  → checked in req.body  (only when present / non-empty)
 *   - { param: 'name' }  → checked in req.params  (always required)
 *   - { body: 'name' }   → checked in req.body    (always required)
 *   - { bodyOpt: 'name' }→ checked in req.body    (only when present)
 */
function validateIds(...fields) {
  return (req, res, next) => {
    for (const f of fields) {
      if (typeof f === 'string') {
        // body field, optional (skip if absent/empty)
        const val = req.body[f];
        if (val !== undefined && val !== '') {
          if (!isValidId(val)) {
            return res.status(400).json({
              error: `Ungültige ID für Feld "${f}": nur Kleinbuchstaben, Ziffern und Bindestriche erlaubt (z. B. "sv-test")`,
            });
          }
        }
      } else if (f.param) {
        const val = req.params[f.param];
        if (val !== undefined && val !== '') {
          if (!isValidId(val)) {
            return res.status(400).json({
              error: `Ungültige ID in URL-Parameter "${f.param}": nur Kleinbuchstaben, Ziffern und Bindestriche erlaubt`,
            });
          }
        }
      } else if (f.body) {
        const val = req.body[f.body];
        if (!val) {
          return res.status(400).json({ error: `Feld "${f.body}" ist erforderlich` });
        }
        if (!isValidId(val)) {
          return res.status(400).json({
            error: `Ungültige ID für Feld "${f.body}": nur Kleinbuchstaben, Ziffern und Bindestriche erlaubt`,
          });
        }
      } else if (f.bodyOpt) {
        const val = req.body[f.bodyOpt];
        if (val !== undefined && val !== '' && !isValidId(val)) {
          return res.status(400).json({
            error: `Ungültige ID für Feld "${f.bodyOpt}": nur Kleinbuchstaben, Ziffern und Bindestriche erlaubt`,
          });
        }
      }
    }
    next();
  };
}

module.exports = { isValidId, validateIds };
