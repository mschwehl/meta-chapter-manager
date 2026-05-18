/**
 * <dashboard-view> — Tile-based dashboard hub
 * Shows stats + navigation tiles based on user rights.
 * Tiles are derived from injected role flags — single source of truth.
 *
 * Inject: api, i18n, user, ctx, org, statusCls, isOrgaAdmin, isZeitstelle, isChapterAdminAnywhere, hasAnyChapterRole, sseEvent
 */
const DashboardView = {
  name: 'DashboardView',
  inject: ['api', 'i18n', 'user', 'ctx', 'org', 'statusCls', 'isOrgaAdmin', 'isZeitstelle', 'isChapterAdminAnywhere', 'hasAnyChapterRole', 'sseEvent'],
  data() {
    return {
      stats: { offeneEvents: 0, freigegebeneEvents: 0, mitglieder: 0, chapters: 0 },
      dashEvents: [],
    };
  },
  computed: {
    isOrga() { return this.ctx?.type === 'orgadmin'; },
    organisationLabel() {
      const source = this.org?.value || this.org || {};
      const name = String(source.name || '').trim();
      return name || 'Organisation';
    },
    priorities() {
      const p = [];
      if (this.stats.offeneEvents > 0 && (this.ctx?.type === 'zeitstelle' || this.ctx?.type === 'spartenadmin' || this.ctx?.type === 'chapteradmin')) {
        p.push({ id: 'events', icon: '📅', tone: 'amber', title: `${this.stats.offeneEvents} offene Veranstaltungen`, text: 'Jetzt prüfen und freigeben' });
      }
      if (this.ctx?.type === 'orgadmin' && this.stats.chapters === 0) {
        p.push({ id: 'chapters', icon: '🏢', tone: 'blue', title: 'Noch kein Verband angelegt', text: 'Starte mit dem ersten Verband' });
      }
      if (this.ctx?.type === 'orgadmin' && this.stats.mitglieder === 0) {
        p.push({ id: 'useradmin', icon: '👥', tone: 'indigo', title: 'Noch keine Benutzer vorhanden', text: 'Lege den ersten Benutzer an' });
      }
      return p;
    },
    tiles() {
      const t = [];
      const type = this.ctx?.type;
      const s = this.stats;
      if (type === 'orgadmin') {
        t.push({ id: 'chapters', icon: '\uD83C\uDFE2', label: 'Verband', desc: 'Verband verwalten, Sparten & Admins', color: 'blue', badge: s.chapters, badgeColor: 'text-blue-600' });
        t.push({ id: 'useradmin', icon: '\uD83D\uDC65', label: 'Benutzer', desc: 'Benutzerpool verwalten, anlegen & bearbeiten', color: 'indigo', badge: s.mitglieder, badgeColor: 'text-indigo-600' });
        t.push({ id: 'usersyncv', icon: '🔄', label: 'UserSyncV', desc: 'Datei-Sync (CSV/JSON) nach Kürzel', color: 'teal' });
        t.push({ id: 'orga', icon: '\uD83C\uDFDB', label: this.organisationLabel, desc: 'Stammdaten und Sync-Strategie verwalten', color: 'purple' });
        t.push({ id: 'sysinfo', icon: '\u2699\uFE0F', label: 'System & Git', desc: 'Server-Info, Git-Status & Datenbank', color: 'gray' });
        t.push({ id: 'settings', icon: '\uD83D\uDD27', label: 'Einstellungen', desc: 'Passwort \u00e4ndern & Darstellung', color: 'slate' });
      }
      if (type === 'chapteradmin') {
        t.push({ id: 'chapters', icon: '\uD83C\uDFE2', label: 'Mein Verband', desc: 'Mitglieder, Sparten & Einstellungen', color: 'purple' });
        t.push({ id: 'events', icon: '\uD83D\uDCC5', label: 'Veranstaltungen', desc: 'Termine anlegen und verwalten', color: 'green', badge: s.offeneEvents, badgeLabel: 'offen', badgeColor: 'text-green-600' });
        t.push({ id: 'settings', icon: '\uD83D\uDD27', label: 'Einstellungen', desc: 'Passwort & Darstellung', color: 'slate' });
      }
      if (type === 'spartenadmin') {
        t.push({ id: 'pruefe', icon: '\u23F1', label: 'Zeitkorrektur pr\u00fcfen', desc: 'Freigabelisten pr\u00fcfen & bearbeiten', color: 'teal' });
        t.push({ id: 'events', icon: '\uD83D\uDCC5', label: 'Veranstaltungen', desc: 'Termine der Sparte', color: 'green', badge: s.offeneEvents, badgeLabel: 'offen', badgeColor: 'text-green-600' });
        t.push({ id: 'settings', icon: '\uD83D\uDD27', label: 'Einstellungen', desc: 'Passwort & Darstellung', color: 'slate' });
      }
      if (type === 'zeitstelle') {
        t.push({ id: 'dokumente', icon: '\uD83D\uDCC2', label: 'Dokumente', desc: 'Dateien hochladen und verwalten', color: 'amber' });
        t.push({ id: 'events', icon: '\uD83D\uDCC5', label: 'Veranstaltungen', desc: 'Termine einsehen und freigeben', color: 'green', badge: s.offeneEvents, badgeLabel: 'offen', badgeColor: 'text-green-600' });
        t.push({ id: 'settings', icon: '\uD83D\uDD27', label: 'Einstellungen', desc: 'Passwort & Darstellung', color: 'slate' });
      }
      return t;
    },
    colorMap() {
      return {
        blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   hover: 'hover:border-blue-300 hover:shadow-blue-100/50' },
        indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-100 text-indigo-600', hover: 'hover:border-indigo-300 hover:shadow-indigo-100/50' },
        green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',  hover: 'hover:border-green-300 hover:shadow-green-100/50' },
        purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', hover: 'hover:border-purple-300 hover:shadow-purple-100/50' },
        teal:   { bg: 'bg-teal-50',   icon: 'bg-teal-100 text-teal-600',   hover: 'hover:border-teal-300 hover:shadow-teal-100/50' },
        amber:  { bg: 'bg-amber-50',  icon: 'bg-amber-100 text-amber-600',  hover: 'hover:border-amber-300 hover:shadow-amber-100/50' },
        gray:   { bg: 'bg-gray-50',   icon: 'bg-gray-100 text-gray-600',   hover: 'hover:border-gray-300 hover:shadow-gray-100/50' },
        slate:  { bg: 'bg-slate-50',  icon: 'bg-slate-100 text-slate-600',  hover: 'hover:border-slate-300 hover:shadow-slate-100/50' },
      };
    },
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
        this.dashEvents = evs.slice(0, 5);
      } catch {}
    },
    fmtDate(iso) {
      if (!iso) return '–';
      const d = new Date(iso);
      return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },
    c(color) { return this.colorMap[color] || this.colorMap.gray; },
  },
  watch: {
    sseEvent(evt) { if (!evt) return; if (['event', 'user', 'chapter', 'sparte'].includes(evt.category)) this.load(); },
  },
  mounted() { this.load(); },
  emits: ['navigate'],
  template: `
<div class="p-4 sm:p-6 lg:p-8 max-w-6xl xl:max-w-7xl 2xl:max-w-[96rem] mx-auto space-y-6">
  <!-- Header -->
  <div>
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-100">Willkommen, {{ user.vorname }}!</h1>
    <p class="text-gray-500 dark:text-gray-400 mt-1 text-sm">\u00dcbersicht \u00fcber Ihre Vereinsaktivit\u00e4ten</p>
  </div>

  <!-- Priority strip -->
  <div v-if="priorities.length" class="grid grid-cols-1 lg:grid-cols-2 gap-3">
    <button v-for="p in priorities" :key="p.id" @click="$emit('navigate', p.id)"
      class="text-left rounded-xl border p-4 transition-colors"
      :class="p.tone === 'amber'
        ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
        : p.tone === 'indigo'
          ? 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100'
          : 'bg-blue-50 border-blue-200 hover:bg-blue-100'">
      <div class="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Priorit\u00e4t</div>
      <div class="mt-1 flex items-start gap-2">
        <span class="text-base">{{ p.icon }}</span>
        <div>
          <div class="font-semibold text-sm text-gray-800">{{ p.title }}</div>
          <div class="text-xs text-gray-600 mt-0.5">{{ p.text }}</div>
        </div>
      </div>
    </button>
  </div>

  <!-- Navigation tiles -->
  <div>
    <div class="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Bereiche</div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      <button v-for="tile in tiles" :key="tile.id"
        @click="$emit('navigate', tile.id)"
        :class="c(tile.color).hover"
        class="text-left bg-white dark:bg-[#1a1d27] rounded-2xl border border-gray-200 dark:border-[#2d3148] p-5 shadow-sm hover:shadow-md transition-all group focus:outline-none focus:ring-2 focus:ring-blue-400">
        <div class="flex items-start gap-4">
          <div :class="c(tile.color).icon" class="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0">{{ tile.icon }}</div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-gray-800 dark:text-gray-100 text-sm group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">{{ tile.label }}</span>
              <span v-if="tile.badge != null && tile.badge > 0" :class="tile.badgeColor || 'text-gray-600'" class="text-lg font-bold leading-none">{{ tile.badge }}<span v-if="tile.badgeLabel" class="text-[10px] font-normal text-gray-400 ml-0.5">{{ tile.badgeLabel }}</span></span>
            </div>
            <div class="text-gray-400 dark:text-gray-500 text-xs mt-0.5 leading-relaxed">{{ tile.desc }}</div>
          </div>
        </div>
      </button>
    </div>
  </div>

  <!-- Recent events (not shown for org-admin) -->
  <div v-if="!isOrga" class="bg-white dark:bg-[#1a1d27] rounded-xl shadow-sm border border-gray-100 dark:border-[#2d3148]">
    <div class="px-5 py-4 border-b border-gray-100 dark:border-[#2d3148] flex items-center justify-between">
      <h3 class="font-semibold text-gray-700 dark:text-gray-200 text-sm">Aktuelle Veranstaltungen</h3>
      <button @click="$emit('navigate','events')" class="text-blue-600 text-xs font-medium hover:underline">Alle anzeigen \u2192</button>
    </div>
    <div v-if="dashEvents.length === 0" class="p-8 text-center text-gray-400 text-sm">Keine Veranstaltungen vorhanden.</div>
    <div v-else class="overflow-x-auto">
    <table class="w-full min-w-[42rem] text-sm">
      <thead class="text-gray-500 dark:text-gray-400 text-xs uppercase bg-gray-50 dark:bg-[#13151d]">
        <tr>
          <th class="px-5 py-2 text-left">Datum</th>
          <th class="px-5 py-2 text-left">Verband</th>
          <th class="px-5 py-2 text-left">Sparte</th>
          <th class="px-5 py-2 text-left">Ort</th>
          <th class="px-5 py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="ev in dashEvents" :key="ev.id" class="border-t border-gray-50 dark:border-[#2d3148] hover:bg-gray-50 dark:hover:bg-[#1e2130]">
          <td class="px-5 py-2.5 font-medium text-gray-800 dark:text-gray-200">{{ fmtDate(ev.datum) }}</td>
          <td class="px-5 py-2.5 text-gray-600 dark:text-gray-400">{{ i18n.chapter(ev.chapterId) }}</td>
          <td class="px-5 py-2.5 text-gray-600 dark:text-gray-400">{{ i18n.sparte(ev.sparte) }}</td>
          <td class="px-5 py-2.5 text-gray-500 dark:text-gray-500">{{ ev.ort || '\u2013' }}</td>
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
</div>
`
};

if (typeof window !== 'undefined') window.DashboardView = DashboardView;
