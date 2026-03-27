/**
 * <system-info> — Technische Details (nur OrgaAdmin)
 * Inject: api, apiPost, isOrgaAdmin
 */
const SystemInfo = {
  name: 'SystemInfo',
  inject: ['api', 'apiPost', 'isOrgaAdmin'],
  emits: ['back'],
  data() {
    return {
      info: null,
      loading: true,
      error: '',
      // Git CLI
      gitCmd: '',
      gitHistory: [],     // { cmd, output, error, ts }
      gitRunning: false,
      // Git log detail
      gitLogExpanded: {},  // hash → { files, diff, loading }
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
    async runGit() {
      const raw = this.gitCmd.trim();
      if (!raw) return;
      // Parse: strip leading "git " if present
      let parts = raw.replace(/^git\s+/, '').split(/\s+/);
      this.gitCmd = '';
      this.gitRunning = true;
      const entry = { cmd: 'git ' + parts.join(' '), output: '', error: '', ts: new Date() };
      this.gitHistory.push(entry);
      try {
        const r = await this.apiPost('/api/admin/git', { args: parts });
        const data = await r.json();
        if (!r.ok) { entry.error = data.error || 'Fehler'; }
        else { entry.output = data.output || '(keine Ausgabe)'; }
      } catch (e) { entry.error = e.message; }
      this.gitRunning = false;
      this.$nextTick(() => {
        const el = this.$refs.cliOutput;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    async toggleCommit(e) {
      const h = e.hash;
      if (this.gitLogExpanded[h]) { delete this.gitLogExpanded[h]; return; }
      this.gitLogExpanded[h] = { diff: '', loading: true };
      try {
        const r = await this.apiPost('/api/admin/git', { args: ['show', '--stat', '--format=', h] });
        const data = await r.json();
        if (r.ok) this.gitLogExpanded[h].diff = data.output || '';
      } catch {}
      this.gitLogExpanded[h].loading = false;
    },
    quickCmd(cmd) {
      this.gitCmd = cmd;
      this.runGit();
    },
  },
  template: `
<div class="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-[#0f1117]">
  <div class="max-w-5xl mx-auto">

    <div class="flex items-center gap-3 mb-6">
      <button @click="$emit('back')" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
      <h1 class="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-tight">⚙️ Technische Details</h1>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm text-center py-16">Lade…</div>
    <div v-else-if="error" class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{{ error }}</div>

    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

        <!-- Server -->
        <div class="bg-white dark:bg-[#1a1d27] rounded-xl border border-gray-200/80 dark:border-[#2d3148] shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
            <span class="text-sm">🖥</span>
            <span class="font-semibold text-gray-700 dark:text-gray-200 text-[13px]">Server</span>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Node.js</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.server.nodeVersion }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Plattform</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.server.platform }} / {{ info.server.arch }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Hostname</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.server.hostname }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Uptime</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ fmtUptime(info.server.uptime) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">RAM (RSS)</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.server.memUsedMb }} MB</dd></div>
          </dl>
        </div>

        <!-- Config -->
        <div class="bg-white dark:bg-[#1a1d27] rounded-xl border border-gray-200/80 dark:border-[#2d3148] shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
            <span class="text-sm">🔧</span>
            <span class="font-semibold text-gray-700 dark:text-gray-200 text-[13px]">Konfiguration</span>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Port</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.config.port }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-400 shrink-0">Data-Dir</dt><dd class="font-mono text-gray-700 dark:text-gray-300 text-xs break-all text-right">{{ info.config.dataDir }}</dd></div>
            <div class="flex justify-between gap-4"><dt class="text-gray-400 shrink-0">Git-URL</dt><dd class="font-mono text-gray-700 dark:text-gray-300 text-xs break-all text-right">{{ info.config.gitDbUrl }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Branch</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.config.gitDbBranch }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">SSL-Verify</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.config.gitSslVerify ? 'ja' : 'nein' }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Commit-Autor</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.config.gitDbAuthorName }}</dd></div>
          </dl>
        </div>

        <!-- Datenbank -->
        <div class="bg-white dark:bg-[#1a1d27] rounded-xl border border-gray-200/80 dark:border-[#2d3148] shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
            <span class="text-sm">💾</span>
            <span class="font-semibold text-gray-700 dark:text-gray-200 text-[13px]">Datenbank</span>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Organisation</dt><dd class="font-semibold text-gray-700 dark:text-gray-300">{{ info.db.orgName }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Benutzer</dt><dd class="font-semibold text-gray-700 dark:text-gray-300">{{ info.db.userCount }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Chapters</dt><dd class="font-semibold text-gray-700 dark:text-gray-300">{{ info.db.chapterCount }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Sparten</dt><dd class="font-semibold text-gray-700 dark:text-gray-300">{{ info.db.sparteCount }}</dd></div>
          </dl>
        </div>

        <!-- Git Status (live) -->
        <div class="bg-white dark:bg-[#1a1d27] rounded-xl border border-gray-200/80 dark:border-[#2d3148] shadow-sm overflow-hidden">
          <div class="px-5 py-2.5 border-b border-gray-100 dark:border-[#2d3148] flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm">🌿</span>
              <span class="font-semibold text-gray-700 dark:text-gray-200 text-[13px]">Git Status</span>
            </div>
            <div class="flex gap-1">
              <button @click="quickCmd('status --short')" class="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-[#252a3d] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2d3148]">status</button>
              <button @click="quickCmd('branch -v')" class="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-[#252a3d] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2d3148]">branch</button>
              <button @click="quickCmd('remote -v')" class="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-[#252a3d] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2d3148]">remote</button>
              <button @click="quickCmd('diff --stat')" class="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-[#252a3d] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#2d3148]">diff</button>
            </div>
          </div>
          <dl class="px-5 py-3.5 space-y-2 text-[13px]">
            <div class="flex justify-between"><dt class="text-gray-400">Branch</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.config.gitDbBranch }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Remote</dt><dd class="font-mono text-gray-700 dark:text-gray-300 text-xs">{{ info.config.gitDbUrl }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-400">Commits</dt><dd class="font-mono text-gray-700 dark:text-gray-300">{{ info.gitLog.length }}</dd></div>
          </dl>
        </div>

      </div>

      <!-- Git Log (full width, expandable) -->
      <div class="bg-white dark:bg-[#1a1d27] rounded-xl border border-gray-200/80 dark:border-[#2d3148] shadow-sm overflow-hidden mb-5">
        <div class="px-5 py-2.5 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
          <span class="text-sm">📋</span>
          <span class="font-semibold text-gray-700 dark:text-gray-200 text-[13px]">Git Log</span>
          <span class="text-[10px] text-gray-400 ml-1">(klicken für Details)</span>
        </div>
        <div v-if="!info.gitLog.length" class="px-5 py-4 text-gray-400 text-sm">Keine Einträge.</div>
        <ul v-else class="divide-y divide-gray-50 dark:divide-[#2d3148] max-h-[400px] overflow-y-auto">
          <li v-for="e in info.gitLog" :key="e.hash" class="group">
            <button @click="toggleCommit(e)" class="w-full text-left px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-[#252a3d] transition-colors">
              <div class="flex items-center gap-2">
                <span class="font-mono text-[10px] text-gray-400 shrink-0 bg-gray-100 dark:bg-[#252a3d] px-1.5 py-0.5 rounded select-all">{{ e.hash.slice(0,7) }}</span>
                <span class="text-[12px] text-gray-700 dark:text-gray-300 flex-1 truncate">{{ e.message }}</span>
                <span class="text-[10px] text-gray-400 shrink-0">{{ fmtDate(e.date) }}</span>
                <svg class="w-3 h-3 text-gray-300 shrink-0 transition-transform" :class="gitLogExpanded[e.hash] ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              </div>
              <div class="text-[10px] text-gray-400 mt-0.5 ml-[4.5rem]">{{ e.author }}</div>
            </button>
            <div v-if="gitLogExpanded[e.hash]" class="px-5 pb-3">
              <div v-if="gitLogExpanded[e.hash].loading" class="text-gray-400 text-xs py-2 animate-pulse">Lade…</div>
              <pre v-else class="text-[11px] font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-[#0d1117] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto">{{ gitLogExpanded[e.hash].diff || '(keine Änderungen)' }}</pre>
            </div>
          </li>
        </ul>
      </div>

      <!-- Git CLI -->
      <div class="bg-[#0d1117] rounded-xl border border-gray-700/50 shadow-sm overflow-hidden mb-5">
        <div class="px-4 py-2 border-b border-gray-700/50 flex items-center gap-2">
          <span class="text-green-400 text-xs font-mono font-bold">$</span>
          <span class="font-semibold text-gray-300 text-[13px]">Git Terminal</span>
          <span class="text-[10px] text-gray-500 ml-auto font-mono">log, status, diff, show, branch, remote, stash</span>
        </div>
        <div ref="cliOutput" class="px-4 py-3 max-h-[350px] overflow-y-auto font-mono text-[12px] space-y-3" style="min-height:80px">
          <div v-if="!gitHistory.length" class="text-gray-500 text-xs">Geben Sie einen git-Befehl ein, z.B. <span class="text-green-400">log --oneline -20</span></div>
          <div v-for="(h, i) in gitHistory" :key="i">
            <div class="text-green-400 flex items-center gap-1.5"><span class="text-gray-500">$</span> git {{ h.cmd.replace('git ','') }}</div>
            <pre v-if="h.output" class="text-gray-300 whitespace-pre-wrap mt-1 leading-relaxed">{{ h.output }}</pre>
            <pre v-if="h.error" class="text-red-400 whitespace-pre-wrap mt-1">{{ h.error }}</pre>
          </div>
          <div v-if="gitRunning" class="text-gray-500 animate-pulse">Ausführung…</div>
        </div>
        <div class="border-t border-gray-700/50 px-4 py-2 flex items-center gap-2">
          <span class="text-green-400 text-sm font-mono font-bold shrink-0">git</span>
          <input v-model="gitCmd" @keydown.enter="runGit" :disabled="gitRunning"
            class="flex-1 bg-transparent text-gray-200 font-mono text-[12px] outline-none placeholder:text-gray-600"
            placeholder="log --oneline -20" autocomplete="off" spellcheck="false" />
          <button @click="runGit" :disabled="gitRunning || !gitCmd.trim()"
            class="text-[10px] font-semibold px-3 py-1 rounded bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-30 transition-colors">Run</button>
        </div>
      </div>

    </template>

  </div>
</div>
`
};

if (typeof window !== 'undefined') window.SystemInfo = SystemInfo;
