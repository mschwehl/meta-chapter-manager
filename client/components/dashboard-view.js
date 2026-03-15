/**
 * <dashboard-view> — Stats overview + recent events table
 *
 * Inject: api, i18n, user, statusCls
 */
const DashboardView = {
  name: 'DashboardView',
  inject: ['api', 'i18n', 'user', 'statusCls'],
  data() {
    return {
      stats: { offeneEvents: 0, freigegebeneEvents: 0, mitglieder: 0, chapters: 0 },
      dashEvents: [],
    };
  },
  methods: {
    async load() {
      try {
        const [evR, usR, chR] = await Promise.all([
          this.api('/api/events'),
          this.api('/api/admin/users').catch(() => ({ json: async () => [] })),
          this.api('/api/chapters'),
        ]);
        const evs = await evR.json();
        const users = typeof usR.json === 'function' ? await usR.json() : [];
        const chs = await chR.json();
        this.stats.offeneEvents = evs.filter(e => e.status === 'offen').length;
        this.stats.freigegebeneEvents = evs.filter(e => e.status === 'freigegeben').length;
        this.stats.mitglieder = Array.isArray(users) ? users.length : 0;
        this.stats.chapters = chs.length;
        this.dashEvents = evs.slice(0, 8);
      } catch {}
    },
  },
  mounted() { this.load(); },
  emits: ['navigate'],
  template: `
<div class="p-6 max-w-6xl mx-auto space-y-6">
  <div>
    <h1 class="text-2xl font-bold text-gray-800">Willkommen, {{ user.vorname }}!</h1>
    <p class="text-gray-500 mt-1 text-sm">Übersicht über Ihre Vereinsaktivitäten</p>
  </div>
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div class="text-2xl font-bold text-blue-600">{{ stats.offeneEvents }}</div>
      <div class="text-gray-500 text-xs mt-1">Offene Veranstaltungen</div>
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div class="text-2xl font-bold text-green-600">{{ stats.freigegebeneEvents }}</div>
      <div class="text-gray-500 text-xs mt-1">Freigegeben</div>
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div class="text-2xl font-bold text-indigo-600">{{ stats.mitglieder }}</div>
      <div class="text-gray-500 text-xs mt-1">Mitglieder</div>
    </div>
    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
      <div class="text-2xl font-bold text-purple-600">{{ stats.chapters }}</div>
      <div class="text-gray-500 text-xs mt-1">Chapter</div>
    </div>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100">
    <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
      <h3 class="font-semibold text-gray-700 text-sm">Aktuelle Veranstaltungen</h3>
      <button @click="$emit('navigate','events')" class="text-blue-600 text-xs font-medium hover:underline">Alle anzeigen →</button>
    </div>
    <div v-if="dashEvents.length === 0" class="p-8 text-center text-gray-400 text-sm">Keine Veranstaltungen vorhanden.</div>
    <table v-else class="w-full text-sm">
      <thead class="text-gray-500 text-xs uppercase bg-gray-50">
        <tr>
          <th class="px-5 py-2 text-left">Datum</th>
          <th class="px-5 py-2 text-left">Chapter</th>
          <th class="px-5 py-2 text-left">Sparte</th>
          <th class="px-5 py-2 text-left">Ort</th>
          <th class="px-5 py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ev in dashEvents" :key="ev.id" class="border-t border-gray-50 hover:bg-gray-50">
          <td class="px-5 py-2.5 font-medium">{{ ev.datum }}</td>
          <td class="px-5 py-2.5 text-gray-600">{{ i18n.chapter(ev.chapterId) }}</td>
          <td class="px-5 py-2.5 text-gray-600">{{ i18n.sparte(ev.sparte) }}</td>
          <td class="px-5 py-2.5 text-gray-500">{{ ev.ort || '–' }}</td>
          <td class="px-5 py-2.5">
            <span :class="statusCls(ev.status)" class="px-2 py-0.5 rounded-full text-[11px] font-semibold">
              {{ i18n.eventStatus(ev.status) }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.DashboardView = DashboardView;
