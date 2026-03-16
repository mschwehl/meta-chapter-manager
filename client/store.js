/**
 * store.js — kuerzel-prefixed localStorage wrapper
 *
 * Keys layout:
 *   mcm.active            → kuerzel of the currently active session (unprefixed)
 *   mcm.{kuerzel}.token   → JWT token
 *   mcm.{kuerzel}.user    → JSON serialised user object
 *   mcm.{kuerzel}.mustChange → '1' when password change is required
 *
 * This prevents one browser user's session from leaking into another's
 * when two accounts are used on the same browser.
 */
window.MCM_STORE = (() => {
  const ACTIVE_KEY = 'mcm.active';

  function activeKuerzel() {
    return localStorage.getItem(ACTIVE_KEY) || '';
  }

  function _key(name, kuerzel) {
    const k = kuerzel || activeKuerzel();
    if (!k) return 'mcm._anon.' + name;   // fallback before login
    return `mcm.${k}.${name}`;
  }

  function get(name, kuerzel) {
    return localStorage.getItem(_key(name, kuerzel));
  }

  function set(name, value, kuerzel) {
    localStorage.setItem(_key(name, kuerzel), value);
  }

  function remove(name, kuerzel) {
    localStorage.removeItem(_key(name, kuerzel));
  }

  /** Set the active kuerzel AND write token + user in one call (used at login). */
  function login(kuerzel, token, userObj, mustChange) {
    localStorage.setItem(ACTIVE_KEY, kuerzel);
    localStorage.setItem(_key('token',      kuerzel), token);
    localStorage.setItem(_key('user',       kuerzel), JSON.stringify(userObj));
    if (mustChange) {
      localStorage.setItem(_key('mustChange', kuerzel), '1');
    } else {
      localStorage.removeItem(_key('mustChange', kuerzel));
    }
  }

  /** Clear all keys for the active (or given) kuerzel and remove the active pointer. */
  function logout(kuerzel) {
    const k = kuerzel || activeKuerzel();
    const prefix = `mcm.${k}.`;
    Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(ACTIVE_KEY);
  }

  return { get, set, remove, login, logout, activeKuerzel };
})();
