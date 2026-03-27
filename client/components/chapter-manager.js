/**
 * <chapter-manager> — Full chapter management
 *   Section A: Chapter overview grid (+ requests for org-admin)
 *   Section B: Chapter edit form (org-admin / chapter-admin)
 *   Section C: Sparte detail page (edit / new)
 *   Section D: Chapter detail (tabbed: Übersicht, Sparten, Mitglieder, Einstellungen)
 *
 * Inject: api, apiPost, apiPut, i18n, user, isOrgaAdmin, isChapterAdminAnywhere,
 *         userNameCache, uPickSearch, uPickAdd, uPickRemove, uPickKeydown, isActive
 * Emits: navigate (mod switch)
 */
const ChapterManager = {
  name: 'ChapterManager',
  inject: ['api', 'apiPost', 'apiPut', 'i18n', 'user', 'ctx', 'isOrgaAdmin', 'isChapterAdminAnywhere',
           'userNameCache', 'uPickSearch', 'uPickAdd', 'uPickRemove', 'uPickKeydown', 'isActive', 'sseEvent'],
  emits: ['navigate'],
  data() {
    return {
      chaptersList: [],
      chEdit: null,
      chEditMode: 'new',
      chError: '',
      chNewSparte: { id: '', name: '' },
      chPicker: { search: '', results: [], list: [], activeIdx: -1 },
      chAdminPicker: { search: '', results: [], list: [], activeIdx: -1, saving: false, error: '' },
      chSpartePickers: {},
      // Member table
      chMbAll: [],
      chMbLoaded: false,
      chMbLoading: false,
      chMbFilter: {},
      chMbSort: {},
      chMbPending: {},
      chSelected: '',
      chSelectedSparte: null,
      chShowMembers: false,
      chTab: 'overview',     // 'overview' | 'sparten' | 'mitglieder' | 'einstellungen'
      // Sparte edit/new detail page
      chSparteEdit: null,    // { chId, sparte, mode: 'edit'|'new' }
      chSparteEditPicker: { search: '', results: [], list: [], activeIdx: -1 },
      chSparteEditError: '',
      // Eintritt / Austritt
      chEintritt: {},
      chAustrittPending: {},
      chAustrittGrund: {},
      _eintrittTimer: null,
      // Create user inline
      chUserCreate: null,
      chUserCreateError: '',
      // Requests (org-admin)
      requests: [],
      rqLoading: false,
      rqError: '',
      // Org-admins panel
      orgAdmins: [],
      orgAdminPicker: { search: '', results: [], list: [], activeIdx: -1 },
      orgAdminSaving: false,
      orgAdminError: '',
    };
  },
  methods: {
    // ── Role helpers ──
    canEditChapterStructure(cid) { return this.canManageChapterMembers(cid); },
    canManageChapterMembers(cid) { return (this.user.roles || {})[cid]?.level === ROLE_LEVEL.CHAPTER; },

    // ── Name loading ──
    async loadNamesForList(kuerzels) {
      const missing = [...new Set(kuerzels)].filter(k => k && !this.userNameCache[k]);
      await Promise.all(missing.map(async k => {
        try { const r = await this.api(`/api/admin/users/${k}`); if (r.ok) { const u = await r.json(); this.userNameCache[k] = `${u.vorname} ${u.name}`.trim(); } } catch {}
      }));
    },

    // ── Load chapters list ──
    async loadChaptersList() {
      try {
        const r = await this.api('/api/chapters');
        if (!r.ok) return;
        const list = await r.json();
        if (!Array.isArray(list)) return;
        this.chaptersList = list;
        this.loadNamesForList(list.flatMap(c => [...(c.admins||[]), ...(c.sparten||[]).flatMap(s => s.admins||[])]));
        if (!this.chSelected) {
          const my = list.filter(c => this.canManageChapterMembers(c.id));
          if (my.length === 1 && !this.isOrgaAdmin) this.chSelected = my[0].id;
          else if (!this.isOrgaAdmin && my.length > 0) this.chSelected = my[0].id;
        } else {
          // chSelected was set before data arrived — re-init admin picker now
          const ch = list.find(c => c.id === this.chSelected);
          if (ch) {
            this.chAdminPicker.list = [...(ch.admins || [])];
            this.loadNamesForList(ch.admins || []);
          }
        }
      } catch {}
    },

    // ── Edit ──
    chInitNew() {
      this.chSelected = ''; this.chEdit = { id: '', name: '', admins: [], sparten: [] };
      this.chEditMode = 'new'; this.chPicker.list = []; this.chPicker.search = ''; this.chPicker.results = [];
      this.initSpartePickers({ sparten: [] }); this.chError = '';
    },
    chStartEdit(ch) {
      this.chEdit = JSON.parse(JSON.stringify(ch)); this.chEditMode = 'edit';
      this.chPicker.list = [...(ch.admins || [])]; this.chPicker.search = ''; this.chPicker.results = [];
      this.initSpartePickers(ch); this.chError = '';
      this.loadNamesForList([...(ch.admins||[]), ...(ch.sparten||[]).flatMap(s => s.admins||[])]);
    },
    initSpartePickers(ch) {
      const pickers = {};
      for (const sp of (ch.sparten || [])) {
        pickers[sp.id] = { search: '', results: [], list: [...(sp.admins || [])], activeIdx: -1 };
      }
      this.chSpartePickers = pickers;
    },
    chAddSparte() {
      const spId = this.chNewSparte.id.trim().toLowerCase().replace(/\s+/g, '-');
      const spName = this.chNewSparte.name.trim() || spId;
      if (!spId || this.chEdit.sparten.some(s => s.id === spId)) return;
      this.chEdit.sparten.push({ id: spId, name: spName, admins: [], datumAngelegt: null, datumStillgelegt: null });
      this.chSpartePickers[spId] = { search: '', results: [], list: [], activeIdx: -1 };
      this.chNewSparte.id = ''; this.chNewSparte.name = '';
    },
    chRemoveSparte(si, sp) { this.chEdit.sparten.splice(si, 1); delete this.chSpartePickers[sp.id]; },
    async chSave() {
      this.chError = '';
      const sparten = this.chEdit.sparten.map(sp => ({ ...sp, admins: [...(this.chSpartePickers[sp.id]?.list || [])] }));
      const data = { ...this.chEdit, admins: [...this.chPicker.list], sparten };
      try {
        if (this.chEditMode === 'new') {
          const r = await this.apiPost('/api/chapters', data); if (!r.ok) { this.chError = (await r.json()).error; return; }
        } else {
          const r = await this.apiPut(`/api/chapters/${data.id}`, data); if (!r.ok) { this.chError = (await r.json()).error; return; }
        }
        this.chEdit = null; this.loadChaptersList();
        if (this.chEditMode !== 'new') this.chSelected = data.id;
      } catch (e) { this.chError = e.message; }
    },
    chStartSparteEdit(ch, sp) {
      this.chSparteEdit = { chId: ch.id, sparte: JSON.parse(JSON.stringify(sp)), mode: 'edit' };
      this.chSparteEditPicker = { search: '', results: [], list: [...(sp.admins || [])], activeIdx: -1 };
      this.chSparteEditError = '';
      this.loadNamesForList(sp.admins || []);
    },
    chStartSparteNew(ch) {
      this.chSparteEdit = { chId: ch.id, sparte: { id: '', name: '', admins: [], datumAngelegt: new Date().toISOString().slice(0, 10), datumStillgelegt: null }, mode: 'new' };
      this.chSparteEditPicker = { search: '', results: [], list: [], activeIdx: -1 };
      this.chSparteEditError = '';
    },
    async chSaveSparteEdit() {
      this.chSparteEditError = '';
      const { chId, sparte, mode } = this.chSparteEdit;
      const ch = this.chaptersList.find(c => c.id === chId);
      if (!ch) return;
      const updated = JSON.parse(JSON.stringify(ch));
      if (mode === 'new') {
        const spId = sparte.id.trim().toLowerCase().replace(/\s+/g, '-');
        if (!spId) { this.chSparteEditError = 'ID ist erforderlich.'; return; }
        if (updated.sparten.some(s => s.id === spId)) { this.chSparteEditError = 'Eine Sparte mit dieser ID existiert bereits.'; return; }
        updated.sparten.push({ ...sparte, id: spId, name: sparte.name.trim() || spId, admins: [...this.chSparteEditPicker.list] });
      } else {
        const idx = updated.sparten.findIndex(s => s.id === sparte.id);
        if (idx === -1) return;
        updated.sparten[idx] = { ...sparte, admins: [...this.chSparteEditPicker.list] };
      }
      try {
        const r = await this.apiPut(`/api/chapters/${chId}`, updated);
        if (!r.ok) { this.chSparteEditError = (await r.json()).error; return; }
        this.chSparteEdit = null;
        await this.loadChaptersList();
      } catch (e) { this.chSparteEditError = e.message; }
    },
    async chSaveAdmins(ch) {      this.chAdminPicker.saving = true; this.chAdminPicker.error = '';
      try {
        const data = { ...ch, admins: [...this.chAdminPicker.list] };
        const r = await this.apiPut(`/api/chapters/${ch.id}`, data);
        if (!r.ok) { this.chAdminPicker.error = (await r.json()).error || 'Fehler'; return; }
        await this.loadChaptersList();
        const updated = this.chaptersList.find(c => c.id === ch.id);
        if (updated) this.chAdminPicker.list = [...(updated.admins || [])];
      } catch (e) { this.chAdminPicker.error = e.message; }
      finally { this.chAdminPicker.saving = false; }
    },

    // ── Member table ──
    async loadChapterMembers() {
      this.chMbLoading = true;
      try { const r = await this.api('/api/admin/users'); if (r.ok) { this.chMbAll = await r.json(); this.chMbLoaded = true; } }
      catch {} finally { this.chMbLoading = false; }
    },
    chMbToggle(chId) {
      if (!(chId in this.chMbFilter)) this.chMbFilter[chId] = '';
      if (!(chId in this.chMbSort))   this.chMbSort[chId] = { col: 'name', dir: 'asc' };
      if (!this.chMbLoaded) this.loadChapterMembers();
    },
    chMbToggleSort(chId, col) {
      const cur = this.chMbSort[chId] || { col: 'name', dir: 'asc' };
      this.chMbSort[chId] = { col, dir: cur.col === col && cur.dir === 'asc' ? 'desc' : 'asc' };
    },
    chMbRows(chId) {
      const filter = (this.chMbFilter[chId] || '').toLowerCase();
      const sort = this.chMbSort[chId] || { col: 'name', dir: 'asc' };
      let rows = [];
      for (const u of this.chMbAll) {
        for (const m of (u.chapters || []).filter(c => c.chapterId === chId)) {
          rows.push({ kuerzel: u.kuerzel||'', vorname: u.vorname||'', name: u.name||'', sparte: m.sparte||'', sparteName: this.i18n.sparte(m.sparte), eintrittsdatum: m.eintrittsdatum||'', austrittsdatum: m.austrittsdatum||'', status: m.status||'aktiv' });
        }
      }
      if (filter) rows = rows.filter(r => r.kuerzel.toLowerCase().includes(filter) || r.vorname.toLowerCase().includes(filter) || r.name.toLowerCase().includes(filter) || r.sparteName.toLowerCase().includes(filter));
      rows.sort((a, b) => {
        const va = (a[sort.col === 'sparteName' ? 'sparteName' : sort.col] || '').toLowerCase();
        const vb = (b[sort.col === 'sparteName' ? 'sparteName' : sort.col] || '').toLowerCase();
        return sort.dir === 'asc' ? va.localeCompare(vb, 'de') : vb.localeCompare(va, 'de');
      });
      return rows;
    },
    chMbPendingSet(chId, row, newSparte) {
      const key = chId + '|' + row.kuerzel + '|' + row.sparte;
      if (newSparte === row.sparte) { delete this.chMbPending[key]; } else { this.chMbPending[key] = newSparte; }
    },
    async chMbSavePending(chId, row) {
      const key = chId + '|' + row.kuerzel + '|' + row.sparte;
      const ns = this.chMbPending[key];
      if (!ns || ns === row.sparte) { delete this.chMbPending[key]; return; }
      try {
        await this.api(`/api/admin/users/${row.kuerzel}/chapter`, { method: 'DELETE', body: JSON.stringify({ chapterId: chId, sparte: row.sparte }) });
        await this.apiPost(`/api/admin/users/${row.kuerzel}/chapter`, { chapterId: chId, sparte: ns, eintrittsdatum: row.eintrittsdatum || null });
        delete this.chMbPending[key];
        await this.loadChapterMembers();
      } catch (e) { alert('Fehler: ' + e.message); }
    },

    // ── Eintritt / Austritt ──
    chEintrittSearch(chId) {
      clearTimeout(this._eintrittTimer);
      const q = (this.chEintritt[chId + '_search'] || '').trim();
      if (q.length < 2) { this.chEintritt[chId + '_results'] = []; return; }
      this._eintrittTimer = setTimeout(async () => {
        try { const r = await this.api(`/api/users/search?q=${encodeURIComponent(q)}`); this.chEintritt[chId + '_results'] = await r.json(); this.chEintritt[chId + '_activeIdx'] = -1; } catch { this.chEintritt[chId + '_results'] = []; }
      }, 300);
    },
    chEintrittSelect(chId, u) {
      this.chEintritt[chId + '_kuerzel'] = u.kuerzel;
      this.chEintritt[chId + '_search'] = `${u.vorname} ${u.name}`;
      this.chEintritt[chId + '_results'] = [];
    },
    chEintrittKeydown(chId, e) {
      const res = this.chEintritt[chId + '_results'] || [];
      const cur = this.chEintritt[chId + '_activeIdx'] ?? -1;
      if (e.key === 'ArrowDown') { e.preventDefault(); this.chEintritt[chId + '_activeIdx'] = res.length ? Math.min(cur + 1, res.length - 1) : -1; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.chEintritt[chId + '_activeIdx'] = Math.max(cur - 1, 0); }
      else if (e.key === 'Enter') { e.preventDefault(); const u = res[cur]; if (u) this.chEintrittSelect(chId, u); }
      else if (e.key === 'Escape') { this.chEintritt[chId + '_results'] = []; }
    },
    async chDoEintritt(chId) {
      const kuerzel = this.chEintritt[chId + '_kuerzel'];
      const sparte = this.chEintritt[chId + '_sparte'];
      const datum = this.chEintritt[chId + '_datum'] || new Date().toISOString().slice(0, 10);
      this.chEintritt[chId + '_error'] = '';
      try {
        const r = await this.apiPost(`/api/admin/users/${kuerzel}/chapter`, { chapterId: chId, sparte, eintrittsdatum: datum, status: 'aktiv' });
        if (!r.ok) { this.chEintritt[chId + '_error'] = (await r.json()).error; return; }
        this.chEintritt[chId + '_kuerzel'] = ''; this.chEintritt[chId + '_search'] = ''; this.chEintritt[chId + '_sparte'] = ''; this.chEintritt[chId + '_datum'] = '';
        await this.loadChapterMembers();
      } catch (e) { this.chEintritt[chId + '_error'] = e.message; }
    },
    async chDoAustritt(chId, row, datum, grund) {
      try {
        const r = await this.api(`/api/admin/users/${row.kuerzel}/chapter`, { method: 'PATCH', body: JSON.stringify({ chapterId: chId, sparte: row.sparte, status: 'passiv', austrittsdatum: datum, austrittsgrund: grund || '' }) });
        if (!r.ok) { alert((await r.json()).error); return; }
        await this.loadChapterMembers();
      } catch (e) { alert(e.message); }
    },
    async chConfirmAustritt(chId, row) {
      const key = chId + '|' + row.kuerzel + '|' + row.sparte;
      const datum = this.chAustrittPending[key] || new Date().toISOString().slice(0, 10);
      const grund = this.chAustrittGrund[key] || '';
      await this.chDoAustritt(chId, row, datum, grund);
      delete this.chAustrittPending[key];
      delete this.chAustrittGrund[key];
    },
    async chDoReactivate(chId, row) {
      try {
        const r = await this.api(`/api/admin/users/${row.kuerzel}/chapter`, { method: 'PATCH', body: JSON.stringify({ chapterId: chId, sparte: row.sparte, status: 'aktiv', austrittsdatum: null, austrittsgrund: '' }) });
        if (!r.ok) { alert((await r.json()).error); return; }
        await this.loadChapterMembers();
      } catch (e) { alert(e.message); }
    },
    async chDoCreateUser() {
      this.chUserCreateError = '';
      try {
        const r = await this.apiPost('/api/admin/users', this.chUserCreate);
        if (!r.ok) { this.chUserCreateError = (await r.json()).error; return; }
        this.chUserCreate = null;
        await this.loadChapterMembers();
      } catch (e) { this.chUserCreateError = e.message; }
    },
    async exportExcel() {
      const r = await this.api('/api/admin/export/users.xlsx');
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'mitglieder.xlsx'; a.click();
      URL.revokeObjectURL(url);
    },

    // ── Requests ──
    async loadRequests() {
      if (!this.isOrgaAdmin) return;
      this.rqLoading = true;
      try { const r = await this.api('/api/admin/requests'); this.requests = await r.json(); } catch {} finally { this.rqLoading = false; }
    },
    async rqApprove(kuerzel) {
      this.rqError = '';
      try {
        const r = await this.apiPost(`/api/admin/requests/${kuerzel}/approve`);
        if (!r.ok) { this.rqError = (await r.json()).error; return; }
        await this.loadRequests();
      } catch (e) { this.rqError = e.message; }
    },
    async rqReject(kuerzel) {
      if (!confirm(`Anfrage von ${kuerzel} wirklich ablehnen?`)) return;
      this.rqError = '';
      try {
        const r = await this.api(`/api/admin/requests/${kuerzel}`, { method: 'DELETE' });
        if (!r.ok) { this.rqError = (await r.json()).error; return; }
        await this.loadRequests();
      } catch (e) { this.rqError = e.message; }
    },

    // ── Org-admins ──
    async loadOrgAdmins() {
      try {
        const r = await this.api('/api/orga');
        if (!r.ok) return;
        const org = await r.json();
        this.orgAdmins = org.orgAdmins || [];
        this.orgAdminPicker.list = [...this.orgAdmins];
        this.loadNamesForList(this.orgAdmins);
      } catch {}
    },
    async saveOrgAdmins() {
      this.orgAdminSaving = true; this.orgAdminError = '';
      try {
        const r = await this.apiPut('/api/orga', { orgAdmins: [...this.orgAdminPicker.list] });
        if (!r.ok) { this.orgAdminError = (await r.json()).error || 'Fehler'; return; }
        await this.loadOrgAdmins();
      } catch (e) { this.orgAdminError = e.message; }
      finally { this.orgAdminSaving = false; }
    },

    // Lifecycle helper: on chSelected change
    onSelectedChange(cid) {
      this.chSelectedSparte = null;
      this.chShowMembers = false;
      this.chSparteEdit = null;
      this.chTab = 'overview';
      if (cid) {
        this.chMbToggle(cid);
        if (!this.chMbLoaded) this.loadChapterMembers();
        const ch = this.chaptersList.find(c => c.id === cid);
        if (ch) {
          this.chAdminPicker.list = [...(ch.admins || [])];
          this.chAdminPicker.search = ''; this.chAdminPicker.results = [];
          this.chAdminPicker.activeIdx = -1; this.chAdminPicker.error = ''; this.chAdminPicker.saving = false;
          this.loadNamesForList(ch.admins || []);
        }
      }
    },
  },
  watch: {
    chSelected(cid) { this.onSelectedChange(cid); },
    sseEvent(evt) {
      if (!evt) return;
      if (evt.category === 'chapter' || evt.category === 'sparte') this.loadChaptersList();
      if (evt.category === 'organisation') this.loadOrgAdmins();
      if (evt.category === 'user' || evt.category === 'request') { this.loadChapterMembers(); if (this.isOrgaAdmin) this.loadRequests(); }
    },
  },
  mounted() {
    // Pre-select chapter from context if applicable
    if (this.ctx?.type === 'chapteradmin' && this.ctx.chapterId) {
      this.chSelected = this.ctx.chapterId;
    }
    this.loadChaptersList();
    if (this.isOrgaAdmin) { this.loadRequests(); this.loadOrgAdmins(); }
  },
  template: `
<div>
  <!-- A: Overview -->
  <div v-if="!chSelected && !chEdit" class="p-6 max-w-5xl mx-auto space-y-8">
    <!-- Requests (org-admin) -->
    <div v-if="isOrgaAdmin && (rqLoading || requests.length)" class="bg-white rounded-xl shadow-sm border border-amber-100">
      <div class="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span>📬</span>
          <span class="font-semibold text-gray-800 text-sm">Registrierungsanfragen</span>
          <span v-if="requests.length" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{{ requests.length }}</span>
        </div>
        <button @click="loadRequests" class="text-gray-400 hover:text-gray-600 text-sm">↻</button>
      </div>
      <div v-if="rqLoading" class="py-6 text-center text-gray-400 text-xs animate-pulse">Laden …</div>
      <div v-else class="divide-y divide-gray-50">
        <div v-for="rq in requests" :key="rq.kuerzel" class="px-5 py-3 flex items-center justify-between gap-4">
          <div>
            <span class="font-semibold text-sm text-gray-800">{{ rq.vorname }} {{ rq.name }}</span>
            <span class="font-mono text-blue-600 text-xs ml-1.5">{{ rq.kuerzel }}</span>
            <div v-if="rq.bemerkung" class="text-gray-500 text-xs italic mt-0.5">„{{ rq.bemerkung }}"</div>
            <div class="text-gray-400 text-[11px]">{{ new Date(rq.requestedAt).toLocaleString('de-DE') }}</div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button @click="rqApprove(rq.kuerzel)" class="px-2.5 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700">✓ Genehmigen</button>
            <button @click="rqReject(rq.kuerzel)" class="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200">✕ Ablehnen</button>
          </div>
        </div>
      </div>
      <div v-if="rqError" class="px-5 pb-3 text-red-600 text-xs">{{ rqError }}</div>
    </div>

    <!-- Chapter cards -->
    <div>
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Chapter</span>
        <button v-if="isOrgaAdmin" @click="chInitNew()" class="btn-sm">+ Neues Chapter</button>
      </div>
      <hr class="border-gray-200 mb-4" />
      <div v-if="!chaptersList.length" class="text-center text-gray-400 text-sm py-10">Keine Chapter vorhanden.</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button v-for="ch in chaptersList" :key="ch.id"
          @click="chSelected = ch.id; chSelectedSparte = null; chMbToggle(ch.id)"
          class="text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-blue-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-blue-400">
          <div class="flex items-start justify-between mb-3">
            <div>
              <div class="text-base font-bold text-gray-800 group-hover:text-blue-700 transition-colors">{{ ch.name }}</div>
              <div class="text-[11px] font-mono text-gray-400 mt-0.5">{{ ch.id }}</div>
            </div>
            <span class="text-blue-400 text-lg group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <div class="flex flex-wrap gap-1 mb-3">
            <span v-for="sp in ch.sparten.filter(s => !s.datumStillgelegt)" :key="sp.id"
              class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-medium">{{ i18n.sparte(sp.id) }}</span>
          </div>
          <div v-if="ch.admins?.length" class="flex flex-wrap gap-1">
            <span v-for="sa in ch.admins" :key="sa" class="bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full text-[11px]">
              <span v-if="userNameCache[sa]">{{ userNameCache[sa] }}</span>
              <span v-else class="font-mono">{{ sa }}</span>
            </span>
          </div>
        </button>
      </div>
    </div>

    <!-- Veranstaltungen shortcut -->
    <div v-if="!isOrgaAdmin && (isChapterAdminAnywhere || Object.keys(user.roles || {}).length)">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Veranstaltungen</span>
      </div>
      <hr class="border-gray-200 mb-4" />
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button @click="$emit('navigate','events')"
          class="text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-green-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-green-400">
          <div class="flex items-start justify-between mb-3">
            <div>
              <div class="text-base font-bold text-gray-800 group-hover:text-green-700 transition-colors">Veranstaltungen</div>
              <div class="text-[11px] text-gray-400 mt-0.5">Termine & Events verwalten</div>
            </div>
            <span class="text-green-400 text-lg group-hover:translate-x-1 transition-transform">📅</span>
          </div>
          <div class="text-gray-400 text-xs">Veranstaltungen anlegen, genehmigen und einsehen</div>
        </button>
      </div>
    </div>

    <!-- Benutzer shortcut (org-admin) -->
    <div v-if="isOrgaAdmin">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Benutzer</span>
      </div>
      <hr class="border-gray-200 mb-4" />
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button @click="$emit('navigate','useradmin')"
          class="text-left bg-white rounded-2xl border border-gray-200 p-5 hover:border-indigo-400 hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <div class="flex items-start justify-between mb-3">
            <div>
              <div class="text-base font-bold text-gray-800 group-hover:text-indigo-700 transition-colors">Alle Benutzer</div>
              <div class="text-[11px] text-gray-400 mt-0.5">Gesamte Benutzerliste</div>
            </div>
            <span class="text-indigo-400 text-lg group-hover:translate-x-1 transition-transform">👥</span>
          </div>
          <div class="text-gray-400 text-xs">Benutzer suchen, anlegen und bearbeiten</div>
        </button>
      </div>
    </div>

    <!-- Org-Admins (org-admin only) -->
    <div v-if="isOrgaAdmin">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Organisations-Admins</span>
      </div>
      <hr class="border-gray-200 dark:border-[#2d3148] mb-4" />
      <div class="bg-white dark:bg-[#1a1d27] rounded-2xl border border-gray-200 dark:border-[#2d3148] p-5">
        <div class="flex flex-wrap gap-2 mb-4">
          <span v-for="k in orgAdmins" :key="k"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
            🏛
            <span v-if="userNameCache[k]">{{ userNameCache[k] }} <span class="opacity-60 font-mono text-[10px]">{{ k }}</span></span>
            <span v-else class="font-mono">{{ k }}</span>
          </span>
          <span v-if="!orgAdmins.length" class="text-gray-400 text-xs">Keine Organisations-Admins hinterlegt</span>
        </div>
        <user-picker :picker="orgAdminPicker" :name-cache="userNameCache"
          placeholder="Kürzel oder Name suchen …"
          :search-fn="uPickSearch" :add-fn="uPickAdd" :remove-fn="uPickRemove" :keydown-fn="uPickKeydown" />
        <div v-if="orgAdminError" class="mt-2 text-red-600 text-xs">{{ orgAdminError }}</div>
        <div class="mt-3 flex gap-2">
          <button @click="saveOrgAdmins" :disabled="orgAdminSaving" class="btn-sm">{{ orgAdminSaving ? 'Speichern …' : 'Speichern' }}</button>
          <button @click="orgAdminPicker.list = [...orgAdmins]" :disabled="orgAdminSaving" class="btn-sec text-xs">Zurücksetzen</button>
        </div>
      </div>
    </div>
  </div>

  <!-- B: Edit form -->
  <div v-else-if="chEdit" class="p-6 max-w-3xl mx-auto space-y-4">
    <div class="flex items-center gap-3 mb-4">
      <button @click="chEdit = null" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
      <span class="text-gray-300">/</span>
      <span class="text-sm font-semibold text-gray-700">{{ chEditMode === 'new' ? 'Neues Chapter' : 'Chapter bearbeiten' }}</span>
    </div>
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 class="font-semibold text-gray-700 mb-4">{{ chEditMode === 'new' ? 'Neues Chapter' : 'Chapter bearbeiten' }}</h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div><label class="lbl">ID</label><input v-model="chEdit.id" :disabled="chEditMode !== 'new'" class="ctrl" placeholder="mein-chapter" /></div>
        <div><label class="lbl">Name</label><input v-model="chEdit.name" class="ctrl" placeholder="z.B. Mein Verein" /></div>
        <div><label class="lbl">Gegründet</label><input type="date" v-model="chEdit.gegruendet" class="ctrl" placeholder="JJJJ-MM-TT" /></div>
        <div><label class="lbl">Aufgelöst</label><input type="date" v-model="chEdit.aufgeloest" class="ctrl" placeholder="JJJJ-MM-TT" /></div>
      </div>
      <div class="mb-4">
        <label class="lbl">Sparten</label>
        <div v-for="(sp, si) in chEdit.sparten" :key="sp.id" class="border border-gray-100 rounded-xl p-3 mb-2 bg-gray-50">
          <div class="flex items-center justify-between mb-2">
            <span class="font-semibold text-sm text-gray-700">{{ sp.name || sp.id }}</span>
            <button @click="chRemoveSparte(si, sp)" class="text-red-400 hover:text-red-600 text-[11px] font-medium">✕ Entfernen</button>
          </div>
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">Datum angelegt</label>
              <input type="date" v-model="sp.datumAngelegt" class="ctrl text-xs" />
            </div>
            <div>
              <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">Datum stillgelegt</label>
              <input type="date" v-model="sp.datumStillgelegt" class="ctrl text-xs" />
            </div>
          </div>
          <div class="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-semibold">Spartenleiter</div>
          <user-picker v-if="chSpartePickers[sp.id]"
            :picker="chSpartePickers[sp.id]" :name-cache="userNameCache"
            placeholder="Spartenleiter suchen …" color="blue"
            :search-fn="uPickSearch" :add-fn="uPickAdd" :remove-fn="uPickRemove" :keydown-fn="uPickKeydown" />
        </div>
        <div class="flex gap-2 mt-3 items-end">
          <div class="flex-1">
            <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">ID</label>
            <input v-model="chNewSparte.id" class="ctrl text-xs" placeholder="z.B. tischtennis" @keydown.enter="chAddSparte" />
          </div>
          <div class="flex-1">
            <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">Name</label>
            <input v-model="chNewSparte.name" class="ctrl text-xs" placeholder="z.B. Tischtennis" @keydown.enter="chAddSparte" />
          </div>
          <button @click="chAddSparte" :disabled="!chNewSparte.id.trim()" class="btn-sm">+ Hinzufügen</button>
        </div>
      </div>
      <div class="mb-4">
        <label class="lbl">Chapter-Admins</label>
        <user-picker :picker="chPicker" :name-cache="userNameCache"
          placeholder="Kürzel oder Name suchen …" color="purple"
          :search-fn="uPickSearch" :add-fn="uPickAdd" :remove-fn="uPickRemove" :keydown-fn="uPickKeydown" />
      </div>
      <div v-if="chError" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ chError }}</div>
      <div class="flex gap-2">
        <button @click="chSave" class="btn-sm">{{ chEditMode === 'new' ? 'Anlegen' : 'Speichern' }}</button>
        <button @click="chEdit = null" class="btn-sec text-xs">Abbrechen</button>
      </div>
    </div>
  </div>

  <!-- C: Sparte detail page (edit / new) -->
  <div v-else-if="chSparteEdit">
    <div class="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-2.5">
      <button @click="chSparteEdit = null" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
      <span class="text-gray-300 text-xs">/</span>
      <span class="text-gray-500 text-sm font-medium">{{ i18n.chapter(chSparteEdit.chId) }}</span>
      <span class="text-gray-300 text-xs">/</span>
      <span class="font-semibold text-gray-800 text-sm">{{ chSparteEdit.mode === 'new' ? 'Neue Sparte' : i18n.sparte(chSparteEdit.sparte.id) }}</span>
    </div>
    <div class="p-6 max-w-2xl mx-auto">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        <h3 class="font-semibold text-gray-700 text-lg">{{ chSparteEdit.mode === 'new' ? 'Neue Sparte anlegen' : 'Sparte bearbeiten' }}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label class="lbl">ID</label>
            <input v-model="chSparteEdit.sparte.id" :disabled="chSparteEdit.mode !== 'new'" :class="chSparteEdit.mode !== 'new' ? 'bg-gray-50 text-gray-400' : ''" class="ctrl" placeholder="z.B. tischtennis" />
          </div>
          <div>
            <label class="lbl">Name</label>
            <input v-model="chSparteEdit.sparte.name" class="ctrl" placeholder="z.B. Tischtennis" />
          </div>
          <div>
            <label class="lbl">Datum angelegt</label>
            <input type="date" v-model="chSparteEdit.sparte.datumAngelegt" class="ctrl" />
          </div>
          <div>
            <label class="lbl">Datum stillgelegt</label>
            <input type="date" v-model="chSparteEdit.sparte.datumStillgelegt" class="ctrl" />
          </div>
        </div>
        <div>
          <label class="lbl">Spartenleiter</label>
          <user-picker :picker="chSparteEditPicker" :name-cache="userNameCache"
            placeholder="Spartenleiter suchen …" color="blue"
            :search-fn="uPickSearch" :add-fn="uPickAdd" :remove-fn="uPickRemove" :keydown-fn="uPickKeydown" />
        </div>
        <div v-if="chSparteEditError" class="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ chSparteEditError }}</div>
        <div class="flex gap-2 pt-2">
          <button @click="chSaveSparteEdit" class="btn-sm">{{ chSparteEdit.mode === 'new' ? 'Anlegen' : 'Speichern' }}</button>
          <button @click="chSparteEdit = null" class="btn-sec text-xs">Abbrechen</button>
        </div>
      </div>
    </div>
  </div>

  <!-- D: Chapter detail (tabbed) -->
  <div v-else-if="chSelected">
    <div v-for="ch in chaptersList.filter(c => c.id === chSelected)" :key="ch.id">
      <!-- Header -->
      <div class="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-2.5">
        <button @click="chSelected = ''" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Chapter-Übersicht</button>
        <span class="text-gray-300 text-xs">/</span>
        <span class="font-semibold text-gray-800 text-sm">{{ ch.name }}</span>
        <span class="text-gray-400 text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded ml-1">{{ ch.id }}</span>
      </div>
      <!-- Tabs -->
      <div class="bg-white border-b border-gray-200 px-6">
        <nav class="flex gap-6 -mb-px">
          <button v-for="tab in [
            { key: 'overview', label: 'Übersicht' },
            { key: 'sparten', label: 'Sparten' },
            { key: 'mitglieder', label: 'Mitglieder' },
            { key: 'einstellungen', label: 'Einstellungen' }
          ].filter(t => t.key !== 'einstellungen' || canManageChapterMembers(ch.id))"
            :key="tab.key" @click="chTab = tab.key"
            :class="chTab === tab.key
              ? 'border-blue-600 text-blue-700 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
            class="py-3 px-1 text-sm border-b-2 transition-colors whitespace-nowrap">{{ tab.label }}</button>
        </nav>
      </div>

      <!-- Tab: Übersicht -->
      <div v-if="chTab === 'overview'" class="p-6 max-w-5xl mx-auto space-y-5">
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div class="flex items-start justify-between gap-6 mb-6">
            <div>
              <h2 class="text-2xl font-bold text-gray-900 mb-1">{{ ch.name }}</h2>
              <div v-if="ch.gegruendet || ch.aufgeloest" class="text-gray-500 text-sm flex items-center gap-3">
                <span v-if="ch.gegruendet">Gegründet {{ ch.gegruendet }}</span>
                <span v-if="ch.gegruendet && ch.aufgeloest" class="text-gray-300">·</span>
                <span v-if="ch.aufgeloest" class="text-red-500">Aufgelöst {{ ch.aufgeloest }}</span>
              </div>
            </div>
            <button v-if="canEditChapterStructure(ch.id)" @click="chStartEdit(ch)" class="btn-sec text-xs shrink-0">✏ Bearbeiten</button>
          </div>
          <!-- KPI cards -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div class="bg-blue-50 rounded-xl p-4 text-center cursor-pointer hover:bg-blue-100 transition-colors" @click="chTab = 'mitglieder'">
              <div class="text-3xl font-bold text-blue-700">{{ chMbRows(ch.id).filter(r => r.status !== 'passiv').length }}</div>
              <div class="text-xs text-blue-600 font-medium mt-1">Aktive Mitglieder</div>
            </div>
            <div class="bg-gray-50 rounded-xl p-4 text-center cursor-pointer hover:bg-gray-100 transition-colors" @click="chTab = 'mitglieder'">
              <div class="text-3xl font-bold text-gray-500">{{ chMbRows(ch.id).filter(r => r.status === 'passiv').length }}</div>
              <div class="text-xs text-gray-500 font-medium mt-1">Passive</div>
            </div>
            <div class="bg-indigo-50 rounded-xl p-4 text-center cursor-pointer hover:bg-indigo-100 transition-colors" @click="chTab = 'sparten'">
              <div class="text-3xl font-bold text-indigo-700">{{ ch.sparten.filter(s => !s.datumStillgelegt).length }}</div>
              <div class="text-xs text-indigo-600 font-medium mt-1">Aktive Sparten</div>
            </div>
            <div class="bg-purple-50 rounded-xl p-4 text-center">
              <div class="text-3xl font-bold text-purple-700">{{ (ch.admins || []).length }}</div>
              <div class="text-xs text-purple-600 font-medium mt-1">Admins</div>
            </div>
          </div>
          <!-- Quick info -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Chapter-Admins</div>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="sa in ch.admins" :key="sa" class="bg-purple-50 text-purple-700 px-2.5 py-0.5 rounded-full text-xs">
                  <span v-if="userNameCache[sa]">{{ userNameCache[sa] }}</span><span v-else class="font-mono">{{ sa }}</span>
                </span>
                <span v-if="!ch.admins?.length" class="text-gray-300 text-xs">–</span>
              </div>
            </div>
            <div>
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Sparten</div>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="sp in ch.sparten.filter(s => !s.datumStillgelegt)" :key="sp.id"
                  class="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:bg-blue-100"
                  @click="chTab = 'sparten'">{{ i18n.sparte(sp.id) }}</span>
                <span v-if="!ch.sparten.filter(s => !s.datumStillgelegt).length" class="text-gray-300 text-xs">–</span>
              </div>
            </div>
          </div>
          <!-- Quick actions -->
          <div class="border-t border-gray-100 mt-6 pt-5 flex flex-wrap items-center gap-3">
            <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Schnellaktionen</span>
            <button v-if="!isOrgaAdmin" @click="$emit('navigate','events')" class="btn-sm">📅 Veranstaltung anlegen</button>
            <button @click="chTab = 'mitglieder'" class="btn-sec text-xs">👥 Mitgliederliste</button>
            <button v-if="canManageChapterMembers(ch.id)" @click="chTab = 'sparten'" class="btn-sec text-xs">🏷 Sparten verwalten</button>
          </div>
        </div>
      </div>

      <!-- Tab: Sparten -->
      <div v-else-if="chTab === 'sparten'" class="p-6 max-w-5xl mx-auto space-y-5">
        <!-- Sparte detail (when selected) -->
        <template v-if="chSelectedSparte">
          <div v-for="sp in ch.sparten.filter(s => s.id === chSelectedSparte)" :key="sp.id"
            class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <button @click="chSelectedSparte = null" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Sparten</button>
                <div>
                  <div class="font-bold text-gray-800 text-lg">{{ i18n.sparte(sp.id) }}</div>
                  <div class="text-xs font-mono text-gray-400">{{ sp.id }}</div>
                </div>
                <span v-if="sp.datumStillgelegt" class="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">stillgelegt {{ sp.datumStillgelegt }}</span>
                <span v-else class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">aktiv</span>
              </div>
              <button v-if="canManageChapterMembers(ch.id)" @click="chStartSparteEdit(ch, sp)" class="btn-sec text-xs">✏ Bearbeiten</button>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Spartenleiter</div>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="k in (sp.admins || [])" :key="k" class="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-full text-xs font-medium">
                    <span v-if="userNameCache[k]">{{ userNameCache[k] }}</span><span v-else class="font-mono">{{ k }}</span>
                  </span>
                  <span v-if="!sp.admins?.length" class="text-gray-300 text-xs italic">Kein Spartenleiter eingetragen</span>
                </div>
              </div>
              <div>
                <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Angelegt</div>
                <div class="text-sm text-gray-700">{{ sp.datumAngelegt || '–' }}</div>
              </div>
            </div>
            <div>
              <div class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Mitglieder ({{ chMbRows(ch.id).filter(r => r.sparte === sp.id && r.status !== 'passiv').length }} aktiv)</div>
              <div class="overflow-x-auto rounded-lg border border-gray-100">
                <table class="w-full text-xs">
                  <thead class="bg-gray-50 text-gray-500 uppercase tracking-wide font-semibold">
                    <tr>
                      <th class="px-3 py-2 text-left">Kürzel</th><th class="px-3 py-2 text-left">Name</th>
                      <th class="px-3 py-2 text-left">Vorname</th><th class="px-3 py-2 text-left">Eintritt</th>
                      <th class="px-3 py-2 text-left">Austritt</th><th class="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="!chMbRows(ch.id).filter(r => r.sparte === sp.id).length">
                      <td colspan="6" class="px-3 py-8 text-center text-gray-300">Keine Mitglieder in dieser Sparte.</td>
                    </tr>
                    <tr v-for="row in chMbRows(ch.id).filter(r => r.sparte === sp.id)" :key="row.kuerzel"
                      :class="row.status === 'passiv' ? 'row-passiv' : ''" class="border-t border-gray-50 hover:bg-gray-50">
                      <td class="px-3 py-2 font-mono text-gray-500">{{ row.kuerzel }}</td>
                      <td class="px-3 py-2 font-medium text-gray-800">{{ row.name }}</td>
                      <td class="px-3 py-2 text-gray-600">{{ row.vorname }}</td>
                      <td class="px-3 py-2 text-gray-400">{{ row.eintrittsdatum || '–' }}</td>
                      <td class="px-3 py-2"><span v-if="row.austrittsdatum" class="text-red-500">{{ row.austrittsdatum }}</span><span v-else class="text-gray-300">–</span></td>
                      <td class="px-3 py-2"><status-badge :active="row.status === 'aktiv'" :label="row.status || 'aktiv'" /></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </template>
        <!-- Sparten list -->
        <template v-else>
          <div class="bg-white rounded-xl shadow-sm border border-gray-100">
            <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div class="text-sm font-semibold text-gray-700">Alle Sparten</div>
              <button v-if="canManageChapterMembers(ch.id)" @click="chStartSparteNew(ch)" class="btn-sm text-xs">+ Neue Sparte</button>
            </div>
            <div class="divide-y divide-gray-50">
              <button v-for="sp in ch.sparten" :key="sp.id" @click="chSelectedSparte = sp.id"
                class="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left group">
                <div class="flex items-center gap-4">
                  <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">{{ (sp.name || sp.id).substring(0, 2).toUpperCase() }}</div>
                  <div>
                    <div class="font-semibold text-sm text-gray-800 group-hover:text-blue-700">{{ i18n.sparte(sp.id) }}</div>
                    <div class="text-[11px] text-gray-400 mt-0.5">{{ chMbRows(ch.id).filter(r => r.sparte === sp.id && r.status !== 'passiv').length }} aktive Mitglieder · {{ (sp.admins || []).length }} Spartenleiter</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span v-if="sp.datumStillgelegt" class="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">stillgelegt</span>
                  <span v-else class="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">aktiv</span>
                  <span class="text-gray-300 group-hover:text-blue-400 transition-colors">→</span>
                </div>
              </button>
              <div v-if="!ch.sparten.length" class="px-6 py-10 text-center text-gray-300 text-sm">Keine Sparten vorhanden.</div>
            </div>
          </div>
        </template>
      </div>

      <!-- Tab: Mitglieder -->
      <div v-else-if="chTab === 'mitglieder'" class="p-6 max-w-5xl mx-auto space-y-5">
        <!-- Eintritt form (chapter-admin only) -->
        <div v-if="canManageChapterMembers(ch.id)" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Mitglied hinzufügen</div>
          <div class="flex flex-wrap gap-3 items-end">
            <div class="flex-1 min-w-36">
              <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">Person suchen</label>
              <div class="relative">
                <input v-model="chEintritt[ch.id + '_search']" @input="chEintrittSearch(ch.id)" @keydown="chEintrittKeydown(ch.id, $event)"
                  placeholder="Name oder Kürzel …" class="ctrl text-xs" autocomplete="off" />
                <div v-if="(chEintritt[ch.id + '_results'] || []).length"
                  class="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                  <div v-for="(u, idx) in chEintritt[ch.id + '_results']" :key="u.kuerzel"
                    @click="chEintrittSelect(ch.id, u)"
                    :class="idx === (chEintritt[ch.id + '_activeIdx'] ?? -1) ? 'pick-highlight-green' : ''"
                    class="flex items-center justify-between px-3 py-2 text-xs cursor-pointer border-b border-gray-50 last:border-0 hover:bg-green-50">
                    <span><span class="font-semibold">{{ u.vorname }} {{ u.name }}</span> <span class="font-mono text-gray-400">({{ u.kuerzel }})</span></span>
                    <span class="text-green-600 font-bold">+</span>
                  </div>
                </div>
              </div>
              <div v-if="chEintritt[ch.id + '_kuerzel']" class="mt-1 text-xs text-green-700 font-mono font-semibold">✓ {{ chEintritt[ch.id + '_kuerzel'] }}</div>
            </div>
            <div>
              <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">Sparte</label>
              <select v-model="chEintritt[ch.id + '_sparte']" class="ctrl text-xs">
                <option value="">– wählen –</option>
                <option v-for="sp in ch.sparten.filter(s => !s.datumStillgelegt)" :key="sp.id" :value="sp.id">{{ i18n.sparte(sp.id) }}</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] text-gray-400 uppercase tracking-wide font-semibold block mb-1">Eintrittsdatum</label>
              <input v-model="chEintritt[ch.id + '_datum']" type="date" class="ctrl text-xs" />
            </div>
            <button @click="chDoEintritt(ch.id)" :disabled="!chEintritt[ch.id + '_kuerzel'] || !chEintritt[ch.id + '_sparte']" class="btn-sm">Eintritt speichern</button>
          </div>
          <div v-if="chEintritt[ch.id + '_error']" class="mt-2 text-red-600 text-xs">{{ chEintritt[ch.id + '_error'] }}</div>
        </div>
        <!-- Member table -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold text-gray-700">Alle Mitglieder</div>
            <button @click="exportExcel" class="btn-sec text-xs flex items-center gap-1">📥 Excel</button>
          </div>
          <div v-if="chMbLoading && !chMbLoaded" class="text-center text-gray-400 text-xs py-6 animate-pulse">Laden …</div>
          <template v-else>
            <input v-model="chMbFilter[ch.id]" placeholder="Filtern nach Name, Kürzel oder Sportart …" class="ctrl text-xs" />
            <div class="overflow-x-auto rounded-lg border border-gray-100">
              <table class="w-full text-xs">
                <thead class="bg-gray-50 text-gray-500 uppercase tracking-wide font-semibold">
                  <tr>
                    <th @click="chMbToggleSort(ch.id, 'kuerzel')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 whitespace-nowrap select-none">Kürzel <span v-if="(chMbSort[ch.id]||{}).col==='kuerzel'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th @click="chMbToggleSort(ch.id, 'vorname')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 select-none">Vorname <span v-if="(chMbSort[ch.id]||{}).col==='vorname'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th @click="chMbToggleSort(ch.id, 'name')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 select-none">Name <span v-if="(chMbSort[ch.id]||{}).col==='name'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th @click="chMbToggleSort(ch.id, 'sparteName')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 select-none">Sportart <span v-if="(chMbSort[ch.id]||{}).col==='sparteName'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th @click="chMbToggleSort(ch.id, 'eintrittsdatum')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 select-none whitespace-nowrap">Eintritt <span v-if="(chMbSort[ch.id]||{}).col==='eintrittsdatum'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th @click="chMbToggleSort(ch.id, 'austrittsdatum')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 select-none whitespace-nowrap">Austritt <span v-if="(chMbSort[ch.id]||{}).col==='austrittsdatum'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th @click="chMbToggleSort(ch.id, 'status')" class="px-3 py-2 text-left cursor-pointer hover:text-blue-600 select-none">Status <span v-if="(chMbSort[ch.id]||{}).col==='status'">{{ (chMbSort[ch.id]||{}).dir==='asc' ? '↑' : '↓' }}</span></th>
                    <th v-if="canManageChapterMembers(ch.id)" class="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="!chMbRows(ch.id).length"><td :colspan="canManageChapterMembers(ch.id) ? 8 : 7" class="px-3 py-8 text-center text-gray-300">Keine Mitglieder gefunden.</td></tr>
                  <template v-for="row in chMbRows(ch.id)" :key="row.kuerzel + '|' + row.sparte">
                  <tr :class="row.status === 'passiv' ? 'row-passiv' : (chAustrittPending[ch.id + '|' + row.kuerzel + '|' + row.sparte] !== undefined ? 'bg-orange-50' : '')"
                    class="border-t border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-3 py-2 font-mono text-gray-500">{{ row.kuerzel }}</td>
                    <td class="px-3 py-2 text-gray-700">{{ row.vorname }}</td>
                    <td class="px-3 py-2 text-gray-800 font-medium">{{ row.name }}</td>
                    <td class="px-3 py-2">
                      <template v-if="canManageChapterMembers(ch.id)">
                        <div class="flex items-center gap-1.5">
                          <select :value="chMbPending[ch.id + '|' + row.kuerzel + '|' + row.sparte] ?? row.sparte"
                            @change="chMbPendingSet(ch.id, row, $event.target.value)" class="ctrl text-xs py-0.5 px-1.5">
                            <option v-for="sp in ch.sparten" :key="sp.id" :value="sp.id">{{ i18n.sparte(sp.id) }}</option>
                          </select>
                          <button v-if="chMbPending[ch.id + '|' + row.kuerzel + '|' + row.sparte] !== undefined"
                            @click="chMbSavePending(ch.id, row)" class="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 whitespace-nowrap">✓</button>
                        </div>
                      </template>
                      <span v-else class="text-gray-600">{{ i18n.sparte(row.sparte) }}</span>
                    </td>
                    <td class="px-3 py-2 text-gray-400 whitespace-nowrap">{{ row.eintrittsdatum || '–' }}</td>
                    <td class="px-3 py-2 whitespace-nowrap"><span v-if="row.austrittsdatum" class="text-red-500">{{ row.austrittsdatum }}</span><span v-else class="text-gray-300">–</span></td>
                    <td class="px-3 py-2"><status-badge :active="row.status === 'aktiv'" :label="row.status || 'aktiv'" /></td>
                    <td v-if="canManageChapterMembers(ch.id)" class="px-3 py-2 text-right whitespace-nowrap">
                      <template v-if="row.status !== 'passiv'">
                        <button v-if="chAustrittPending[ch.id + '|' + row.kuerzel + '|' + row.sparte] === undefined"
                          @click="chAustrittPending[ch.id + '|' + row.kuerzel + '|' + row.sparte] = new Date().toISOString().slice(0,10); chAustrittGrund[ch.id + '|' + row.kuerzel + '|' + row.sparte] = ''"
                          class="text-orange-500 hover:text-orange-700 text-xs font-medium">Austritt …</button>
                        <button v-else
                          @click="delete chAustrittPending[ch.id + '|' + row.kuerzel + '|' + row.sparte]; delete chAustrittGrund[ch.id + '|' + row.kuerzel + '|' + row.sparte]"
                          class="text-gray-400 hover:text-gray-600 text-xs">✕ Abbrechen</button>
                      </template>
                    </td>
                  </tr>
                  <!-- Austritt detail row -->
                  <tr v-if="canManageChapterMembers(ch.id) && chAustrittPending[ch.id + '|' + row.kuerzel + '|' + row.sparte] !== undefined"
                    :key="row.kuerzel + '|' + row.sparte + '|austritt'" class="bg-orange-50 border-t border-orange-100">
                    <td colspan="8" class="px-4 pb-3">
                      <div class="flex flex-wrap items-end gap-3 pt-1">
                        <div>
                          <label class="text-[10px] text-orange-700 uppercase tracking-wide font-semibold block mb-1">Austrittsdatum</label>
                          <input type="date" v-model="chAustrittPending[ch.id + '|' + row.kuerzel + '|' + row.sparte]" class="ctrl text-xs py-1 px-2 w-36" />
                        </div>
                        <div>
                          <label class="text-[10px] text-orange-700 uppercase tracking-wide font-semibold block mb-1">Austrittsgrund</label>
                          <select v-model="chAustrittGrund[ch.id + '|' + row.kuerzel + '|' + row.sparte]" class="ctrl text-xs py-1 px-2 w-40">
                            <option value="">– kein Grund –</option>
                            <option value="Rente">Rente</option>
                            <option value="Ausschluss">Ausschluss</option>
                            <option value="sonstiges">sonstiges</option>
                          </select>
                        </div>
                        <button @click="chConfirmAustritt(ch.id, row)"
                          class="px-3 py-1.5 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 font-semibold whitespace-nowrap">✓ Austritt bestätigen</button>
                      </div>
                    </td>
                  </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>

      <!-- Tab: Einstellungen -->
      <div v-else-if="chTab === 'einstellungen'" class="p-6 max-w-3xl mx-auto space-y-5">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h3 class="text-sm font-semibold text-gray-700">Chapter-Admins</h3>
          <user-picker :picker="chAdminPicker" :name-cache="userNameCache"
            placeholder="Person suchen und hinzufügen …" color="purple" size="md"
            empty-text="Noch kein Chapter-Admin ernannt."
            :search-fn="uPickSearch" :add-fn="uPickAdd" :remove-fn="uPickRemove" :keydown-fn="uPickKeydown" />
          <div v-if="chAdminPicker.error" class="text-red-600 text-xs">{{ chAdminPicker.error }}</div>
          <button @click="chSaveAdmins(ch)" :disabled="chAdminPicker.saving" class="btn-sm">{{ chAdminPicker.saving ? 'Speichern …' : 'Admins speichern' }}</button>
        </div>
      </div>
    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.ChapterManager = ChapterManager;
