/**
 * <events-list> — Event list with filter + create form + approve/reject
 *
 * Inject: api, apiPost, i18n, user, prChapters, statusCls, isOrgaAdmin, isZeitstelle, isChapterAdminAnywhere
 */
const EventsList = {
  name: 'EventsList',
  inject: ['api', 'apiPost', 'i18n', 'user', 'ctx', 'prChapters', 'statusCls', 'isOrgaAdmin', 'isZeitstelle', 'isChapterAdminAnywhere', 'sseEvent'],
  data() {
    return {
      events: [],
      loading: false,
      filter: { status: 'offen' },
      showCreate: false,
      evNew: { chapterId: '', sparte: '', datum: new Date().toISOString().slice(0, 10), von: '18:00', bis: '20:00', ort: '' },
      evNewSparten: [],
      createError: '',
      sortKey: 'datum',
      sortAsc: false,
    };
  },
  computed: {
    eventStatusOptions() { return this.i18n.eventStatusOptions(); },
    canCreate() {
      return this.isChapterAdminAnywhere || Object.keys(this.user.roles || {}).length > 0;
    },
    singleChapter() {
      // If context locks us to one chapter (chapteradmin/spartenadmin), or user has exactly one chapter role
      if (this.ctx?.chapterId) return this.ctx.chapterId;
      const myChapters = Object.keys(this.user.roles || {});
      return myChapters.length === 1 ? myChapters[0] : null;
    },
    sorted() {
      const sk = this.sortKey;
      const d = this.sortAsc ? 1 : -1;
      return [...this.events].sort((a, b) => {
        const va = (a[sk] || '').toLowerCase();
        const vb = (b[sk] || '').toLowerCase();
        return va < vb ? -d : va > vb ? d : 0;
      });
    },
  },
  methods: {
    fmtDate(iso) {
      if (!iso) return '–';
      const [y, m, d] = iso.split('-');
      return `${d}.${m}.${y}`;
    },
    toggleSort(key) {
      if (this.sortKey === key) { this.sortAsc = !this.sortAsc; }
      else { this.sortKey = key; this.sortAsc = false; }
    },
    sortIcon(key) {
      if (this.sortKey !== key) return '⇕';
      return this.sortAsc ? '↑' : '↓';
    },
    canApprove(ev) {
      return this.isOrgaAdmin || this.isZeitstelle ||
        !!(this.user.roles || {})[ev.chapterId]?.level;
    },
    onChapterChange() {
      this.evNew.sparte = '';
      const ch = this.prChapters.find(c => c.id === this.evNew.chapterId);
      this.evNewSparten = ch?.sparten || [];
    },
    async create() {
      this.createError = '';
      try {
        const r = await this.apiPost('/api/events', { ...this.evNew });
        if (!r.ok) { this.createError = (await r.json()).error; return; }
        this.showCreate = false;
        Object.assign(this.evNew, { chapterId: '', sparte: '', datum: new Date().toISOString().slice(0, 10), von: '18:00', bis: '20:00', ort: '' });
        this.load();
      } catch (e) { this.createError = e.message; }
    },
    async approve(ev) {
      try { const r = await this.apiPost(`/api/events/${ev.id}/approve`, { chapterId: ev.chapterId }); if (r.ok) this.load(); } catch {}
    },
    async reject(ev) {
      try { const r = await this.apiPost(`/api/events/${ev.id}/reject`, { chapterId: ev.chapterId }); if (r.ok) this.load(); } catch {}
    },
    async load() {
      this.loading = true;
      try {
        const p = new URLSearchParams();
        if (this.filter.status) p.set('status', this.filter.status);
        const r = await this.api(`/api/events?${p}`);
        this.events = await r.json();
      } catch {} finally { this.loading = false; }
    },
  },
  watch: {
    sseEvent(evt) {
      if (!evt) return;
      if (evt.category === 'event') this.load();
    },
  },
  emits: ['back'],
  mounted() {
    this.load();
    // Auto-fill chapter from context or when user has exactly one chapter role
    if (this.singleChapter) {
      this.evNew.chapterId = this.singleChapter;
      this.onChapterChange();
    }
  },
  template: `
<div class="p-6 max-w-6xl mx-auto space-y-4">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div class="flex items-center gap-3">
      <button @click="$emit('back')" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
      <div>
        <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100">Veranstaltungen</h1>
        <p v-if="!loading" class="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{{ events.length }} {{ filter.status ? i18n.eventStatus(filter.status) : 'gesamt' }}</p>
      </div>
    </div>
    <div class="flex gap-2 items-center">
      <div class="relative">
        <span v-if="filter.status" class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 z-10 pointer-events-none"></span>
        <select v-model="filter.status" @change="load" class="ctrl text-xs">
          <option value="">Alle Status</option>
          <option v-for="o in eventStatusOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
      </div>
      <button v-if="canCreate" @click="showCreate = !showCreate" class="btn-sm flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        Neue Veranstaltung
      </button>
    </div>
  </div>

  <!-- Create form -->
  <div v-if="showCreate" class="bg-white dark:bg-[#1a1d27] rounded-xl shadow-sm border border-gray-100 dark:border-[#2d3148] p-5">
    <h3 class="font-semibold text-gray-700 dark:text-gray-200 mb-4 text-sm">Neue Veranstaltung anlegen</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
      <div v-if="!singleChapter">
        <label class="lbl">Chapter</label>
        <select v-model="evNew.chapterId" @change="onChapterChange" class="ctrl text-xs">
          <option value="">– Wählen –</option>
          <option v-for="ch in prChapters" :key="ch.id" :value="ch.id">{{ i18n.chapter(ch.id) }}</option>
        </select>
      </div>
      <div>
        <label class="lbl">Sparte</label>
        <select v-model="evNew.sparte" class="ctrl text-xs" :disabled="!evNew.chapterId">
          <option value="">– Wählen –</option>
          <option v-for="sp in evNewSparten" :key="sp.id" :value="sp.id">{{ sp.name || sp.id }}</option>
        </select>
      </div>
      <div><label class="lbl">Datum</label><input v-model="evNew.datum" type="date" class="ctrl text-xs" /></div>
      <div><label class="lbl">Von</label><input v-model="evNew.von" type="time" class="ctrl text-xs" /></div>
      <div><label class="lbl">Bis</label><input v-model="evNew.bis" type="time" class="ctrl text-xs" /></div>
      <div><label class="lbl">Ort</label><input v-model="evNew.ort" type="text" class="ctrl text-xs" /></div>
    </div>
    <div v-if="createError" class="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-700 dark:text-red-400 text-xs">{{ createError }}</div>
    <div class="flex gap-2">
      <button @click="create" :disabled="!evNew.chapterId || !evNew.sparte || !evNew.datum" class="btn-sm disabled:opacity-40 disabled:cursor-not-allowed">Speichern</button>
      <button @click="showCreate = false" class="btn-sec text-xs">Abbrechen</button>
    </div>
  </div>

  <!-- Table -->
  <div class="bg-white dark:bg-[#1a1d27] rounded-xl shadow-sm border border-gray-100 dark:border-[#2d3148] overflow-hidden">
    <div v-if="loading" class="p-10 text-center text-gray-400 text-sm animate-pulse">Laden …</div>
    <div v-else-if="events.length === 0" class="p-10 text-center">
      <div class="text-4xl mb-3">📅</div>
      <p class="text-gray-500 dark:text-gray-400 text-sm font-medium">Keine Veranstaltungen{{ filter.status ? ' mit Status „' + i18n.eventStatus(filter.status) + '“' : '' }}</p>
      <button v-if="filter.status" @click="filter.status = ''; load()" class="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline">Filter zurücksetzen</button>
      <button v-else-if="canCreate" @click="showCreate = true" class="mt-4 btn-sm text-xs">Erste Veranstaltung anlegen</button>
    </div>
    <table v-else class="w-full text-sm">
      <thead class="text-gray-500 dark:text-gray-400 text-xs uppercase bg-gray-50 dark:bg-[#1e2130]">
        <tr>
          <th class="px-5 py-2.5 text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" @click="toggleSort('datum')">
            Datum <span class="text-[9px] ml-0.5">{{ sortIcon('datum') }}</span>
          </th>
          <th class="px-5 py-2.5 text-left">Zeit</th>
          <th class="px-5 py-2.5 text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" @click="toggleSort('chapterId')">
            Chapter <span class="text-[9px] ml-0.5">{{ sortIcon('chapterId') }}</span>
          </th>
          <th class="px-5 py-2.5 text-left">Sparte</th>
          <th class="px-5 py-2.5 text-left hidden md:table-cell">Ort</th>
          <th class="px-5 py-2.5 text-left hidden lg:table-cell">Erstellt</th>
          <th class="px-5 py-2.5 text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none" @click="toggleSort('status')">
            Status <span class="text-[9px] ml-0.5">{{ sortIcon('status') }}</span>
          </th>
          <th class="px-3 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ev in sorted" :key="ev.id"
          class="border-t border-gray-50 dark:border-[#2d3148] hover:bg-blue-50/40 dark:hover:bg-[#1e2130] transition-colors cursor-default">
          <td class="px-5 py-2.5 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{{ fmtDate(ev.datum) }}</td>
          <td class="px-5 py-2.5 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">{{ ev.von }}–{{ ev.bis }}</td>
          <td class="px-5 py-2.5 text-gray-700 dark:text-gray-300">{{ i18n.chapter(ev.chapterId) }}</td>
          <td class="px-5 py-2.5 text-gray-600 dark:text-gray-400 text-xs">{{ i18n.sparte(ev.sparte) }}</td>
          <td class="px-5 py-2.5 text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ ev.ort || '–' }}</td>
          <td class="px-5 py-2.5 text-gray-400 text-xs font-mono hidden lg:table-cell">{{ ev.erstelltVon }}</td>
          <td class="px-5 py-2.5">
            <span :class="statusCls(ev.status)" class="px-2 py-0.5 rounded-full text-[11px] font-semibold">
              {{ i18n.eventStatus(ev.status) }}
            </span>
          </td>
          <td class="px-3 py-2">
            <div v-if="ev.status === 'offen' && canApprove(ev)" class="flex gap-1">
              <button @click="approve(ev)" class="text-[11px] px-2.5 py-1 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 font-medium transition-colors whitespace-nowrap">✓ Freigeben</button>
              <button @click="reject(ev)" class="text-[11px] px-2.5 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 font-medium transition-colors">✕ Ablehnen</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.EventsList = EventsList;
