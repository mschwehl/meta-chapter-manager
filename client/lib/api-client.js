/**
 * MCM shared utilities — loaded once per page.
 *
 * Provides:
 *   window.McmApi.create(token)  → { api, apiPost, apiPut }
 *   window.McmHelpers            → { statusCls, isActive }
 *   window.McmUserPick           → { uPickSearch, uPickAdd, uPickRemove, uPickKeydown } factory
 */
(() => {

  /* ── API client ── */
  function createApi(token) {
    function api(url, opts = {}) {
      return fetch(url, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(opts.headers || {}),
        },
      });
    }
    function apiPost(url, body) {
      return api(url, { method: 'POST', body: JSON.stringify(body) });
    }
    function apiPut(url, body) {
      return api(url, { method: 'PUT', body: JSON.stringify(body) });
    }
    return { api, apiPost, apiPut };
  }

  /* ── Shared helpers ── */
  function statusCls(s) {
    return { offen: 'status-offen', freigegeben: 'status-freigegeben', abgelehnt: 'status-abgelehnt' }[s] || 'status-default';
  }
  function isActive(ch) {
    const today = new Date().toISOString().slice(0, 10);
    if (!ch.eintrittsdatum || ch.eintrittsdatum > today) return false;
    if (ch.austrittsdatum && ch.austrittsdatum < today) return false;
    return true;
  }

  /* ── User-picker helpers factory ── */
  function createUserPick(apiFn, userNameCache, nextTickFn) {
    let _timer = null;
    function uPickSearch(picker) {
      clearTimeout(_timer);
      if (picker.search.length < 2) { picker.results = []; picker.activeIdx = -1; return; }
      _timer = setTimeout(async () => {
        try { const r = await apiFn(`/api/users/search?q=${encodeURIComponent(picker.search)}`); picker.results = await r.json(); picker.activeIdx = -1; } catch { picker.results = []; picker.activeIdx = -1; }
      }, 300);
    }
    function uPickAdd(picker, u) {
      if (!picker.list.includes(u.kuerzel)) picker.list.push(u.kuerzel);
      userNameCache[u.kuerzel] = `${u.vorname} ${u.name}`.trim();
      picker.search = ''; picker.results = []; picker.activeIdx = -1;
    }
    function uPickRemove(picker, kuerzel) { picker.list = picker.list.filter(k => k !== kuerzel); }
    function _scrollActive(inputEl) {
      const container = inputEl.closest('.relative')?.querySelector('[class*="overflow-y-auto"]');
      if (!container) return;
      container.querySelector('.pick-highlight')?.scrollIntoView({ block: 'nearest' });
    }
    function uPickKeydown(picker, e) {
      const res = picker.results;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        picker.activeIdx = res.length ? Math.min(picker.activeIdx + 1, res.length - 1) : -1;
        nextTickFn(() => _scrollActive(e.target));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        picker.activeIdx = picker.activeIdx > 0 ? picker.activeIdx - 1 : 0;
        nextTickFn(() => _scrollActive(e.target));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = picker.activeIdx >= 0 ? picker.activeIdx : 0;
        const u = res[idx];
        if (u && !picker.list.includes(u.kuerzel)) uPickAdd(picker, u);
      } else if (e.key === 'Escape') {
        picker.results = []; picker.activeIdx = -1;
      }
    }
    return { uPickSearch, uPickAdd, uPickRemove, uPickKeydown };
  }

  /* ── Exports ── */
  window.McmApi = { create: createApi };
  window.McmHelpers = { statusCls, isActive };
  window.McmUserPick = { create: createUserPick };
})();
