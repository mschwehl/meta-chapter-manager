/**
 * <orga-admin> — Organisation settings (name + org-admins)
 *
 * Inject: api, apiPut, i18n, user, isOrgaAdmin, userNameCache, uPickSearch, uPickAdd, uPickRemove, uPickKeydown
 */
const OrgaAdmin = {
  name: 'OrgaAdmin',
  inject: ['api', 'apiPut', 'i18n', 'user', 'isOrgaAdmin', 'userNameCache', 'uPickSearch', 'uPickAdd', 'uPickRemove', 'uPickKeydown'],
  data() {
    return {
      org: null,
      editing: false,
      form: { name: '' },
      error: '',
      picker: { search: '', results: [], list: [], activeIdx: -1 },
      gitLog: [],
      gitLogLoading: false,
      gitLogOpen: false,
    };
  },
  methods: {
    async load() {
      try {
        const r = await this.api('/api/orga');
        this.org = await r.json();
        if (this.org?.orgAdmins) {
          const missing = this.org.orgAdmins.filter(k => k && !this.userNameCache[k]);
          await Promise.all(missing.map(async k => {
            try { const r2 = await this.api(`/api/admin/users/${k}`); if (r2.ok) { const u = await r2.json(); this.userNameCache[k] = `${u.vorname} ${u.name}`.trim(); } } catch {}
          }));
        }
      } catch {}
    },
    startEdit() {
      this.editing = true; this.form.name = this.org.name;
      this.picker.list = [...(this.org.orgAdmins || [])]; this.picker.search = ''; this.picker.results = [];
    },
    async save() {
      this.error = '';
      try {
        const r = await this.apiPut('/api/orga', { name: this.form.name, orgAdmins: [...this.picker.list] });
        if (!r.ok) { this.error = (await r.json()).error; return; }
        this.editing = false; this.load();
      } catch (e) { this.error = e.message; }
    },
    async loadGitLog() {
      this.gitLogLoading = true;
      try {
        const r = await this.api('/api/orga/gitlog?limit=100');
        this.gitLog = await r.json();
      } catch { this.gitLog = []; }
      this.gitLogLoading = false;
    },
    toggleGitLog() {
      this.gitLogOpen = !this.gitLogOpen;
      if (this.gitLogOpen && !this.gitLog.length) this.loadGitLog();
    },
    fmtDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    },
  },
  mounted() { this.load(); },
  template: `
<div class="p-6 max-w-4xl mx-auto space-y-4">
  <h1 class="text-xl font-bold text-gray-800">Organisation</h1>
  <div v-if="org" class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
    <div v-if="!editing" class="space-y-3">
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div><span class="text-gray-500">ID:</span> <span class="font-mono">{{ org.id }}</span></div>
        <div><span class="text-gray-500">Name:</span> <span class="font-semibold">{{ org.name }}</span></div>
      </div>
      <div>
        <div class="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Chapters</div>
        <div class="flex flex-wrap gap-2">
          <span v-for="cid in org.chapters" :key="cid" class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">{{ i18n.chapter(cid) }}</span>
        </div>
      </div>
      <div>
        <div class="text-gray-500 text-xs font-semibold uppercase tracking-wide mb-2">Organisations-Admins</div>
        <div class="flex flex-wrap gap-2">
          <span v-for="oa in org.orgAdmins" :key="oa" class="bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-xs inline-flex items-center gap-1">
            <span v-if="userNameCache[oa]">{{ userNameCache[oa] }} <span class="opacity-60 font-mono text-[10px]">{{ oa }}</span></span>
            <span v-else class="font-mono">{{ oa }}</span>
          </span>
        </div>
      </div>
      <button v-if="isOrgaAdmin" @click="startEdit" class="btn-sm mt-4">Bearbeiten</button>
    </div>
    <div v-else class="space-y-4">
      <div><label class="lbl">Name</label><input v-model="form.name" class="ctrl" /></div>
      <div>
        <label class="lbl">Organisations-Admins</label>
        <user-picker :picker="picker" :name-cache="userNameCache"
          placeholder="Kürzel oder Name suchen …" color="rose"
          :search-fn="uPickSearch" :add-fn="uPickAdd" :remove-fn="uPickRemove" :keydown-fn="uPickKeydown" />
      </div>
      <div v-if="error" class="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ error }}</div>
      <div class="flex gap-2">
        <button @click="save" class="btn-sm">Speichern</button>
        <button @click="editing = false" class="btn-sec text-xs">Abbrechen</button>
      </div>
    </div>
  </div>

  <!-- Git-Protokoll -->
  <div v-if="isOrgaAdmin" class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <button @click="toggleGitLog" class="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors">
      <div class="flex items-center gap-2">
        <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
        <span class="font-semibold text-gray-700 text-sm">Git-Protokoll</span>
        <span v-if="gitLog.length" class="text-xs text-gray-400">({{ gitLog.length }} Einträge)</span>
      </div>
      <svg class="w-4 h-4 text-gray-400 transition-transform" :class="gitLogOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </button>
    <div v-if="gitLogOpen" class="border-t border-gray-100">
      <div v-if="gitLogLoading" class="p-6 text-center text-gray-400 text-xs animate-pulse">Lade Protokoll …</div>
      <div v-else-if="!gitLog.length" class="p-6 text-center text-gray-300 text-xs">Keine Einträge</div>
      <div v-else class="divide-y divide-gray-50 max-h-96 overflow-y-auto">
        <div v-for="entry in gitLog" :key="entry.hash" class="px-6 py-3 flex items-start gap-3 hover:bg-gray-50 text-xs">
          <span class="font-mono text-gray-300 shrink-0 mt-0.5">{{ entry.hash.slice(0,7) }}</span>
          <div class="flex-1 min-w-0">
            <div class="text-gray-800 truncate">{{ entry.message }}</div>
          </div>
          <span class="text-gray-400 shrink-0 whitespace-nowrap">{{ fmtDate(entry.date) }}</span>
        </div>
      </div>
      <div class="px-6 py-2 border-t border-gray-50 flex justify-end">
        <button @click="loadGitLog" class="text-xs text-blue-600 hover:underline">Aktualisieren</button>
      </div>
    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.OrgaAdmin = OrgaAdmin;
