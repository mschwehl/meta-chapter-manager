/**
 * <system-info> — Technische Details (nur OrgaAdmin)
 * Inject: api, isOrgaAdmin
 */
const SystemInfo = {
  name: 'SystemInfo',
  inject: ['api', 'isOrgaAdmin'],
  emits: ['back'],
  data() {
    return {
      info: null,
      loading: true,
      error: '',
    };
  },
  async mounted() {
    try {
      const r = await this.api('/api/admin/sysinfo');
      if (!r.ok) throw new Error((await r.json()).error);
      this.info = await r.json();
    } catch (e) {
      this.error = e.message;
    } finally {
      this.loading = false;
    }
  },
  methods: {
    fmtUptime(s) {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return [h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join(' ');
    },
    fmtDate(iso) {
      if (!iso) return '–';
      return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    },
  },
  template: `
<div class="flex-1 overflow-y-auto p-6 bg-gray-50">
  <div class="max-w-4xl mx-auto">

    <div class="flex items-center gap-3 mb-6">
      <button @click="$emit('back')" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
      <h1 class="text-lg font-bold text-gray-800 tracking-tight">⚙️ Technische Details</h1>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm text-center py-16">Lade…</div>
    <div v-else-if="error" class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{{ error }}</div>

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

        <!-- Server -->
        <div class="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-sm">🖥</span>
            <span class="font-semibold text-gray-700 text-[13px]">Server</span>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Node.js</dt><dd class="font-mono text-gray-700">{{ info.server.nodeVersion }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Plattform</dt><dd class="font-mono text-gray-700">{{ info.server.platform }} / {{ info.server.arch }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Hostname</dt><dd class="font-mono text-gray-700">{{ info.server.hostname }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Uptime</dt><dd class="font-mono text-gray-700">{{ fmtUptime(info.server.uptime) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">RAM (RSS)</dt><dd class="font-mono text-gray-700">{{ info.server.memUsedMb }} MB</dd></div>
          </dl>
        </div>

        <!-- Config -->
        <div class="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-sm">🔧</span>
            <span class="font-semibold text-gray-700 text-[13px]">Konfiguration</span>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Port</dt><dd class="font-mono text-gray-700">{{ info.config.port }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-400 shrink-0">Data-Dir</dt><dd class="font-mono text-gray-700 text-xs break-all text-right">{{ info.config.dataDir }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-400 shrink-0">Git-URL</dt><dd class="font-mono text-gray-700 text-xs break-all text-right">{{ info.config.gitDbUrl }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Branch</dt><dd class="font-mono text-gray-700">{{ info.config.gitDbBranch }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">SSL-Verify</dt><dd class="font-mono text-gray-700">{{ info.config.gitSslVerify ? 'ja' : 'nein' }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Commit-Autor</dt><dd class="font-mono text-gray-700">{{ info.config.gitDbAuthorName }}</dd></div>
          </dl>
        </div>

        <!-- Datenbank -->
        <div class="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-sm">💾</span>
            <span class="font-semibold text-gray-700 text-[13px]">Datenbank</span>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Organisation</dt><dd class="font-semibold text-gray-700">{{ info.db.orgName }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Benutzer</dt><dd class="font-semibold text-gray-700">{{ info.db.userCount }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Chapters</dt><dd class="font-semibold text-gray-700">{{ info.db.chapterCount }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Sparten</dt><dd class="font-semibold text-gray-700">{{ info.db.sparteCount }}</dd></div>
          </dl>
        </div>

        <!-- Git Log -->
        <div class="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <span class="text-sm">📋</span>
            <span class="font-semibold text-gray-700 text-[13px]">Letzte Commits</span>
          </div>
          <div v-if="!info.gitLog.length" class="px-5 py-4 text-gray-400 text-sm">Keine Einträge.</div>
          <ul v-else class="divide-y divide-gray-50">
            <li v-for="e in info.gitLog" :key="e.hash" class="px-5 py-2">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] text-gray-400 shrink-0 bg-gray-50 px-1.5 py-0.5 rounded">{{ e.hash.slice(0,7) }}</span>
                <span class="text-[12px] text-gray-700 flex-1 truncate">{{ e.message }}</span>
              </div>
              <div class="text-[10px] text-gray-400 mt-0.5 ml-[4.5rem]">{{ fmtDate(e.date) }} · {{ e.author }}</div>
            </li>
          </ul>
        </div>

      </div>
    </template>

  </div>
</div>
`
};

if (typeof window !== 'undefined') window.SystemInfo = SystemInfo;
