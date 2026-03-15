/**
 * <events-list> — Event list with filter + create form + approve/reject
 *
 * Inject: api, apiPost, i18n, user, prChapters, statusCls, isOrgaAdmin, isZeitstelle, isSuperadminAnywhere
 */
const EventsList = {
  name: 'EventsList',
  inject: ['api', 'apiPost', 'i18n', 'user', 'prChapters', 'statusCls', 'isOrgaAdmin', 'isZeitstelle', 'isSuperadminAnywhere'],
  data() {
    return {
      events: [],
      loading: false,
      filter: { status: 'offen' },
      showCreate: false,
      evNew: { chapterId: '', sparte: '', datum: new Date().toISOString().slice(0, 10), von: '18:00', bis: '20:00', ort: '' },
      evNewSparten: [],
      createError: '',
    };
  },
  computed: {
    eventStatusOptions() { return this.i18n.eventStatusOptions(); },
  },
  methods: {
    canApprove(ev) {
      return this.isOrgaAdmin || this.isZeitstelle ||
        (this.user.roles || {})[ev.chapterId] === 'chapteradmin' ||
        (this.user.roles || {})[ev.chapterId]?.role === 'spartenadmin';
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
  mounted() { this.load(); },
  template: `
<div class="p-6 max-w-6xl mx-auto space-y-4">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-bold text-gray-800">Veranstaltungen</h1>
    <div class="flex gap-2">
      <select v-model="filter.status" @change="load" class="ctrl text-xs">
        <option value="">Alle Status</option>
        <option v-for="o in eventStatusOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
      <button v-if="isSuperadminAnywhere" @click="showCreate = !showCreate" class="btn-sm">+ Neue Veranstaltung</button>
    </div>
  </div>
  <div v-if="showCreate" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
    <h3 class="font-semibold text-gray-700 mb-4 text-sm">Neue Veranstaltung</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
      <div>
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
    <div v-if="createError" class="mb-2 text-xs text-red-600">{{ createError }}</div>
    <div class="flex gap-2">
      <button @click="create" :disabled="!evNew.chapterId || !evNew.sparte || !evNew.datum" class="btn-sm">Speichern</button>
      <button @click="showCreate = false" class="btn-sec text-xs">Abbrechen</button>
    </div>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100">
    <div v-if="loading" class="p-10 text-center text-gray-400 text-sm animate-pulse">Laden …</div>
    <div v-else-if="events.length === 0" class="p-10 text-center text-gray-400 text-sm">Keine Veranstaltungen.</div>
    <table v-else class="w-full text-sm">
      <thead class="text-gray-500 text-xs uppercase bg-gray-50">
        <tr>
          <th class="px-5 py-2 text-left">Datum</th>
          <th class="px-5 py-2 text-left">Chapter</th>
          <th class="px-5 py-2 text-left">Sparte</th>
          <th class="px-5 py-2 text-left">Ort</th>
          <th class="px-5 py-2 text-left">Erstellt von</th>
          <th class="px-5 py-2 text-left">Status</th>
          <th class="px-5 py-2"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ev in events" :key="ev.id" class="border-t border-gray-50 hover:bg-gray-50">
          <td class="px-5 py-2.5 font-medium">{{ ev.datum }}</td>
          <td class="px-5 py-2.5 text-gray-600">{{ i18n.chapter(ev.chapterId) }}</td>
          <td class="px-5 py-2.5 text-gray-600">{{ i18n.sparte(ev.sparte) }}</td>
          <td class="px-5 py-2.5 text-gray-500">{{ ev.ort || '–' }}</td>
          <td class="px-5 py-2.5 text-gray-500">{{ ev.erstelltVon }}</td>
          <td class="px-5 py-2.5">
            <span :class="statusCls(ev.status)" class="px-2 py-0.5 rounded-full text-[11px] font-semibold">
              {{ i18n.eventStatus(ev.status) }}
            </span>
          </td>
          <td class="px-3 py-2">
            <div v-if="ev.status === 'offen' && canApprove(ev)" class="flex gap-1">
              <button @click="approve(ev)" class="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium">✓ Freigeben</button>
              <button @click="reject(ev)" class="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium">✕ Ablehnen</button>
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
