/**
 * <docs-viewer> — Document list + download
 *
 * Inject: api
 */
const DocsViewer = {
  name: 'DocsViewer',
  inject: ['api'],
  data() {
    return { docs: [], loading: false };
  },
  methods: {
    async load() {
      this.loading = true;
      try { const r = await this.api('/api/docs'); this.docs = await r.json(); } catch {} finally { this.loading = false; }
    },
    download(filename) {
      this.api(`/api/docs/download/${encodeURIComponent(filename)}`)
        .then(r => r.blob())
        .then(b => { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = filename; a.click(); URL.revokeObjectURL(u); });
    },
  },
  mounted() { this.load(); },
  template: `
<div class="p-6 max-w-5xl mx-auto space-y-4">
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-bold text-gray-800">Dokumente</h1>
      <p class="text-gray-500 text-xs mt-1">Generierte Freigabelisten für EPOS/PVS+ · Identifikation über Kürzel (PK)</p>
    </div>
    <button @click="load" class="btn-sec text-xs">↻ Aktualisieren</button>
  </div>
  <div class="bg-white rounded-xl shadow-sm border border-gray-100">
    <div v-if="loading" class="p-10 text-center text-gray-400 text-sm animate-pulse">Laden …</div>
    <div v-else-if="docs.length === 0" class="p-10 text-center text-gray-400 text-sm">Noch keine Dokumente vorhanden.</div>
    <table v-else class="w-full text-sm">
      <thead class="text-gray-500 text-xs uppercase bg-gray-50">
        <tr>
          <th class="px-5 py-2 text-left">Dateiname</th>
          <th class="px-5 py-2 text-left">Erstellt</th>
          <th class="px-5 py-2 text-right">Größe</th>
          <th class="px-5 py-2 text-right"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="doc in docs" :key="doc.filename" class="border-t border-gray-50 hover:bg-gray-50">
          <td class="px-5 py-2.5 font-mono text-xs text-gray-700"><span class="mr-1.5">📄</span>{{ doc.filename }}</td>
          <td class="px-5 py-2.5 text-gray-500">{{ new Date(doc.created).toLocaleString('de-DE') }}</td>
          <td class="px-5 py-2.5 text-gray-400 text-right">{{ (doc.size / 1024).toFixed(1) }} KB</td>
          <td class="px-5 py-2.5 text-right">
            <button @click="download(doc.filename)" class="text-blue-600 hover:text-blue-800 text-xs font-medium">⬇ Download</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.DocsViewer = DocsViewer;
