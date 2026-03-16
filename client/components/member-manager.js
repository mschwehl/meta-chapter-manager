/**
 * <member-manager> — Master-detail member management
 *
 * Inject: api, apiPost, apiPut, i18n, user, prChapters, isOrgaAdmin, isSuperadminAnywhere, hasAnyChapterRole, isActive
 */
const MemberManager = {
  name: 'MemberManager',
  inject: ['api', 'apiPost', 'apiPut', 'i18n', 'user', 'prChapters', 'isOrgaAdmin', 'isSuperadminAnywhere', 'hasAnyChapterRole', 'isActive'],
  data() {
    return {
      members: [],
      loading: false,
      chapter: '',
      sparte: '',
      filter: '',
      selected: null,
      edit: null,
      error: '',
      chapterError: '',
      // Pool search (find users not yet in the current chapter)
      poolQuery: '',
      poolResults: [],
      poolTimer: null,
      addCh: { chapterId: '', sparte: '', eintrittsdatum: new Date().toISOString().slice(0, 10), austrittsdatum: '' },
    };
  },
  computed: {
    accessibleChapters() {
      if (this.isOrgaAdmin) return this.prChapters;
      return this.prChapters.filter(c => { const r = (this.user.roles||{})[c.id]; return r?.level === ROLE_LEVEL.CHAPTER || r?.level === ROLE_LEVEL.SPARTE; });
    },
    // Sparten available for filter: only when a chapter is selected
    spartenInChapter() {
      if (!this.chapter) return [];
      return this.prChapters.find(c => c.id === this.chapter)?.sparten || [];
    },
    filtered() {
      let list = this.members;
      // Non-orgAdmin: only show members who belong to the scoped chapter
      if (!this.isOrgaAdmin && this.chapter) {
        list = list.filter(u => (u.chapters||[]).some(c => c.chapterId === this.chapter));
      }
      // Sparte filter (works for both orgAdmin and chapter admins)
      if (this.sparte) {
        list = list.filter(u => (u.chapters||[]).some(c =>
          c.sparte === this.sparte && (!this.chapter || c.chapterId === this.chapter)
        ));
      }
      const q = this.filter.toLowerCase();
      if (!q) return list;
      return list.filter(u =>
        u.name.toLowerCase().includes(q) || u.vorname.toLowerCase().includes(q) || u.kuerzel.toLowerCase().includes(q)
      );
    },
  },
  methods: {
    // Returns chapter memberships relevant to the current view context (for list chips)
    sparseChips(u) {
      if (!this.isOrgaAdmin && this.chapter) {
        return (u.chapters||[]).filter(c => c.chapterId === this.chapter);
      }
      return u.chapters || [];
    },
    accessibleSparten(chapterId) {
      const all = this.prChapters.find(c => c.id === chapterId)?.sparten || [];
      if (this.isOrgaAdmin || (this.user.roles||{})[chapterId]?.level === ROLE_LEVEL.CHAPTER) return all;
      const r = (this.user.roles||{})[chapterId];
      if (r?.level === ROLE_LEVEL.SPARTE) return all.filter(s => (r.sparten||[]).includes(s.id));
      return [];
    },
    canEditChapter(cid) { return this.isOrgaAdmin || (this.user.roles || {})[cid]?.level === ROLE_LEVEL.CHAPTER; },
    select(u) { this.selected = u; this.edit = null; this.error = ''; this.chapterError = ''; },
    startEdit(u) { this.edit = { name: u.name, vorname: u.vorname, kontakte: JSON.parse(JSON.stringify(u.kontakte || [])) }; this.error = ''; },
    async load() {
      this.loading = true;
      try { const p = this.chapter ? `?chapterId=${this.chapter}` : ''; const r = await this.api(`/api/admin/users${p}`); this.members = await r.json(); } catch {} finally { this.loading = false; }
    },

    async saveEdit() {
      this.error = '';
      try {
        const r = await this.apiPut(`/api/admin/users/${this.selected.kuerzel}`, this.edit);
        if (!r.ok) { this.error = (await r.json()).error; return; }
        const updated = await r.json();
        this.edit = null;
        await this.load();
        this.selected = this.members.find(u => u.kuerzel === updated.kuerzel) || updated;
      } catch (e) { this.error = e.message; }
    },
    async addChapter() {
      this.chapterError = '';
      try {
        const r = await this.apiPost(`/api/admin/users/${this.selected.kuerzel}/chapter`, { ...this.addCh });
        if (!r.ok) { this.chapterError = (await r.json()).error; return; }
        const updated = await r.json();
        await this.load();
        this.selected = this.members.find(u => u.kuerzel === updated.kuerzel) || updated;
        this.addCh.chapterId = ''; this.addCh.sparte = ''; this.addCh.austrittsdatum = '';
      } catch (e) { this.chapterError = e.message; }
    },
    async removeChapter(ch) {
      if (!confirm(`Chapter-Mitgliedschaft ${this.i18n.chapter(ch.chapterId)} – ${this.i18n.sparte(ch.sparte)} wirklich entfernen?`)) return;
      this.chapterError = '';
      try {
        const r = await this.api(`/api/admin/users/${this.selected.kuerzel}/chapter`, { method: 'DELETE', body: JSON.stringify({ chapterId: ch.chapterId, sparte: ch.sparte }) });
        if (!r.ok) { this.chapterError = (await r.json()).error; return; }
        const updated = await r.json();
        await this.load();
        this.selected = this.members.find(u => u.kuerzel === updated.kuerzel) || updated;
      } catch (e) { this.chapterError = e.message; }
    },
    async deleteUser(k) {
      if (!confirm(`Benutzer ${k} wirklich endgültig löschen?`)) return;
      try {
        const r = await this.api(`/api/admin/users/${k}`, { method: 'DELETE' });
        if (!r.ok) { this.error = (await r.json()).error; return; }
        this.selected = null; this.load();
      } catch (e) { this.error = e.message; }
    },
    async resetPw(k) { await this.apiPost(`/api/admin/users/${k}/reset-password`); alert(`Passwort für ${k} zurückgesetzt (Initial: Kürzel).`); },
    // Pool search: find any user in the org by kürzel/name (for adding to chapter)
    poolSearch() {
      clearTimeout(this.poolTimer);
      if (this.poolQuery.length < 2) { this.poolResults = []; return; }
      this.poolTimer = setTimeout(async () => {
        try {
          const r = await this.api(`/api/users/search?q=${encodeURIComponent(this.poolQuery)}`);
          this.poolResults = await r.json();
        } catch { this.poolResults = []; }
      }, 250);
    },
    poolSelect(u) {
      this.selected = u;
      this.poolQuery = '';
      this.poolResults = [];
      this.edit = null;
      this.creating = null;
      this.error = '';
      this.chapterError = '';
      // Pre-fill chapter for chapter-admins
      if (this.chapter) this.addCh.chapterId = this.chapter;
    },
  },
  mounted() {
    // Chapter admins: auto-scope to their first (usually only) accessible chapter
    if (!this.isOrgaAdmin && this.accessibleChapters.length > 0) {
      this.chapter = this.accessibleChapters[0].id;
    }
    this.load();
  },
  template: `
<div class="p-6 max-w-7xl mx-auto">
  <div class="flex rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden" style="height: calc(100vh - 8.5rem);">
    <!-- Master -->
    <div class="w-80 lg:w-96 border-r border-gray-200 flex flex-col shrink-0 min-h-0">
      <div class="px-4 py-3 border-b border-gray-100 space-y-2 shrink-0">
        <div class="flex items-center justify-between">
          <h2 class="font-semibold text-gray-700 text-sm">Mitglieder</h2>
        </div>
        <!-- OrgAdmin: chapter switcher + optional sparte filter -->
        <template v-if="isOrgaAdmin">
          <select v-model="chapter" @change="sparte = ''; load()" class="ctrl text-xs">
            <option value="">Alle Chapter</option>
            <option v-for="ch in prChapters" :key="ch.id" :value="ch.id">{{ i18n.chapter(ch.id) }}</option>
          </select>
          <select v-if="spartenInChapter.length" v-model="sparte" class="ctrl text-xs">
            <option value="">Alle Sparten</option>
            <option v-for="sp in spartenInChapter" :key="sp.id" :value="sp.id">{{ sp.name || sp.id }}</option>
          </select>
        </template>
        <!-- Chapter admin: locked to their chapter(s), filter by Sparte only -->
        <template v-else>
          <select v-if="accessibleChapters.length > 1" v-model="chapter" @change="sparte = ''; load()" class="ctrl text-xs">
            <option v-for="ch in accessibleChapters" :key="ch.id" :value="ch.id">{{ i18n.chapter(ch.id) }}</option>
          </select>
          <div v-else-if="accessibleChapters.length === 1" class="text-xs font-semibold text-gray-600 px-0.5">
            🏢 {{ i18n.chapter(accessibleChapters[0].id) }}
          </div>
          <select v-model="sparte" class="ctrl text-xs">
            <option value="">Alle Sparten</option>
            <option v-for="sp in spartenInChapter" :key="sp.id" :value="sp.id">{{ sp.name || sp.id }}</option>
          </select>
        </template>
        <input v-model="filter" placeholder="Suchen …" class="ctrl text-xs" />
        <!-- Pool search: find any user to assign to this chapter -->
        <div class="relative">
          <input v-model="poolQuery" @input="poolSearch" placeholder="🔍 Benutzer aus Pool suchen …" class="ctrl text-xs border-dashed border-blue-300 bg-blue-50/40" />
          <div v-if="poolResults.length" class="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            <div v-for="u in poolResults" :key="u.kuerzel" @click="poolSelect(u)"
              class="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center justify-between text-xs border-b border-gray-50 last:border-0">
              <span class="font-medium text-gray-800">{{ u.vorname }} {{ u.name }}</span>
              <span class="font-mono text-[10px] text-gray-400">{{ u.kuerzel }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="p-6 text-center text-gray-400 text-xs animate-pulse">Laden …</div>
        <div v-for="u in filtered" :key="u.kuerzel" @click="select(u)"
          :class="{ 'mb-row-active': selected?.kuerzel === u.kuerzel }"
          class="mb-row px-4 py-2.5">
          <div class="flex items-center justify-between">
            <span class="font-medium text-sm text-gray-800">{{ u.name }}, {{ u.vorname }}</span>
            <span class="font-mono text-[10px] text-gray-400">{{ u.kuerzel }}</span>
          </div>
          <div class="flex flex-wrap gap-1 mt-0.5">
            <span v-for="ch in sparseChips(u)" :key="ch.chapterId + ch.sparte"
              :class="isActive(ch) ? 'mb-chip-active' : 'mb-chip-inactive'"
              class="text-[10px]">{{ isOrgaAdmin ? (i18n.chapter(ch.chapterId) + ' · ') : '' }}{{ i18n.sparte(ch.sparte) }}</span>
          </div>
        </div>
        <div v-if="!loading && !filtered.length" class="p-6 text-center text-gray-300 text-xs">Keine Treffer</div>
      </div>
      <div class="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 shrink-0">{{ filtered.length }} Mitglieder</div>
    </div>
    <!-- Detail -->
    <div class="flex-1 overflow-y-auto bg-gray-50 min-h-0">
      <div v-if="!selected" class="flex items-center justify-center h-full text-gray-300 text-sm">← Mitglied auswählen</div>
      <!-- Detail card -->
      <div v-if="selected" class="p-6 max-w-2xl mx-auto space-y-4">
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex items-center justify-between mb-1">
            <div>
              <h2 class="text-lg font-bold text-gray-800">{{ selected.vorname }} {{ selected.name }}</h2>
              <span class="font-mono text-xs text-gray-400">{{ selected.kuerzel }}</span>
              <div v-if="selected.kontakte && selected.kontakte.length" class="text-xs text-gray-400">
                <div v-for="k in selected.kontakte" :key="k.typ + k.wert">{{ k.typ }}: {{ k.wert }}</div>
              </div>
            </div>
            <div v-if="isSuperadminAnywhere" class="flex gap-2">
              <button @click="startEdit(selected)" class="btn-sm text-xs">✏ Stammdaten</button>
              <button @click="resetPw(selected.kuerzel)" class="btn-sec text-xs">PW Reset</button>
              <button @click="deleteUser(selected.kuerzel)" class="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50">🗑 Löschen</button>
            </div>
          </div>
          <div v-if="edit" class="mt-4 pt-4 border-t border-gray-100">
            <div class="grid grid-cols-2 gap-4 mb-3">
              <div><label class="lbl">Nachname</label><input v-model="edit.name" class="ctrl" /></div>
              <div><label class="lbl">Vorname</label><input v-model="edit.vorname" class="ctrl" /></div>
            </div>
            <div class="mb-3">
              <label class="lbl">Kontakte</label>
              <div v-for="(k, idx) in edit.kontakte" :key="idx" class="flex items-center gap-2 mb-1">
                <select v-model="k.typ" class="ctrl text-xs w-32">
                  <option value="email">E-Mail</option>
                  <option value="telefon">Telefon</option>
                  <option value="postadresse">Postadresse</option>
                </select>
                <input v-model="k.wert" class="ctrl flex-1" :placeholder="k.typ === 'email' ? 'max@example.de' : k.typ === 'telefon' ? '+49 …' : 'Straße, PLZ Ort'" />
                <button @click="edit.kontakte.splice(idx, 1)" type="button" class="text-red-400 hover:text-red-600 text-xs">✕</button>
              </div>
              <button @click="edit.kontakte.push({ typ: 'email', wert: '' })" type="button" class="text-blue-600 hover:text-blue-800 text-xs font-medium mt-1">+ Kontakt hinzufügen</button>
            </div>
            <div v-if="error" class="mb-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ error }}</div>
            <div class="flex gap-2">
              <button @click="saveEdit" class="btn-sm text-xs">Speichern</button>
              <button @click="edit = null" class="btn-sec text-xs">Abbrechen</button>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Chapter-Mitgliedschaften</div>
          <div v-for="ch in (selected.chapters || [])" :key="ch.chapterId + ch.sparte"
            class="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
            <span class="text-sm text-gray-700 font-medium">{{ i18n.chapter(ch.chapterId) }}</span>
            <span class="text-sm text-gray-500">{{ i18n.sparte(ch.sparte) }}</span>
            <status-badge :active="isActive(ch)" />
            <span class="text-gray-400 text-xs ml-auto">{{ ch.eintrittsdatum }}<span v-if="ch.austrittsdatum"> – {{ ch.austrittsdatum }}</span></span>
            <button v-if="canEditChapter(ch.chapterId)" @click="removeChapter(ch)" class="text-red-400 hover:text-red-600 text-xs ml-2">✕</button>
          </div>
          <div v-if="!selected.chapters?.length" class="text-gray-300 text-xs py-2 text-center">Keine Mitgliedschaften</div>
          <div v-if="isSuperadminAnywhere || hasAnyChapterRole" class="mt-4 pt-4 border-t border-gray-100">
            <div class="text-xs font-semibold text-gray-500 mb-2">Mitgliedschaft hinzufügen</div>
            <div class="flex items-end gap-2 flex-wrap">
              <div class="flex-1 min-w-[120px]">
                <label class="lbl">Chapter</label>
                <select v-model="addCh.chapterId" @change="addCh.sparte = ''" class="ctrl text-xs">
                  <option value="">–</option>
                  <option v-for="c in accessibleChapters" :key="c.id" :value="c.id">{{ i18n.chapter(c.id) }}</option>
                </select>
              </div>
              <div class="flex-1 min-w-[120px]">
                <label class="lbl">Sparte</label>
                <select v-model="addCh.sparte" class="ctrl text-xs">
                  <option value="">–</option>
                  <option v-for="sp in accessibleSparten(addCh.chapterId)" :key="sp.id" :value="sp.id">{{ sp.name || sp.id }}</option>
                </select>
              </div>
              <div class="w-32">
                <label class="lbl">Eintrittsdatum</label>
                <input v-model="addCh.eintrittsdatum" type="date" class="ctrl text-xs" />
              </div>
              <div class="w-32">
                <label class="lbl">Austrittsdatum</label>
                <input v-model="addCh.austrittsdatum" type="date" class="ctrl text-xs" />
              </div>
              <button @click="addChapter" :disabled="!addCh.chapterId || !addCh.sparte" class="btn-sm text-xs">+ Hinzufügen</button>
            </div>
            <div v-if="chapterError" class="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ chapterError }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.MemberManager = MemberManager;
