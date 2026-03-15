/**
 * <pruefe-wizard> — 3-step event verification wizard
 *   Step 1: Event details + PDF upload
 *   Step 2: Participant search + matching
 *   Step 3: Zeitkorrektur review + Word/email export
 *
 * Inject: api, apiPost, i18n, user, prChapters, org, ctx
 * Emits: done (when user cancels/resets → parent goes back to ctx)
 */
const PruefeWizard = {
  name: 'PruefeWizard',
  inject: ['api', 'i18n', 'user', 'prChapters', 'org', 'ctx'],
  props: {
    /** Pre-fill chapterId + sparteId from context (spartenadmin) */
    initChapterId: { type: String, default: '' },
    initSparteId:  { type: String, default: '' },
  },
  emits: ['done'],
  data() {
    return {
      steps: ['Veranstaltung & PDF', 'Teilnehmer prüfen', 'Zeitkorrektur'],
      step: 1,
      event: {
        chapterId: this.initChapterId || '',
        sparte: this.initSparteId || '',
        datum: new Date().toISOString().slice(0, 10),
        von: '18:00', bis: '20:00', ort: '',
      },
      sparten: [],
      dragOver: false,
      uploadError: '',
      pdfUrl: '',
      search: '',
      results: [],
      resultsIdx: -1,
      matched: [],
      generating: false,
      downloadErr: '',
      searching: false,
      wordDownloaded: false,
      pdfDownloaded: false,
      _searchCache: new Map(),
      _searchTimer: null,
    };
  },
  computed: {
    isSpartenadmin() { return this.ctx?.type === 'spartenadmin'; },
  },
  watch: {
    initChapterId(v) { if (v) { this.event.chapterId = v; this.onChapterChange(); } },
    initSparteId(v)  { if (v) this.event.sparte = v; },
  },
  mounted() {
    if (this.event.chapterId) this.onChapterChange();
  },
  methods: {
    onChapterChange() {
      this.event.sparte = this.initSparteId || '';
      const ch = this.prChapters.find(c => c.id === this.event.chapterId);
      this.sparten = ch?.sparten || [];
    },
    uploadPdf(e) { const f = e.target.files[0]; if (f) this.processPdf(f); },
    onDrop(e) { this.dragOver = false; const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') this.processPdf(f); else this.uploadError = 'Nur PDF.'; },
    processPdf(file) {
      this.uploadError = '';
      if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
      this.pdfUrl = URL.createObjectURL(file);
      this.matched = []; this.step = 2;
      this.$nextTick(() => this.$refs.searchRef?.focus());
    },
    onSearchInput() {
      const q = this.search.trim();
      if (q.length < 2) { this.results = []; return; }
      if (this._searchCache.has(q)) { this.results = this._searchCache.get(q); return; }
      clearTimeout(this._searchTimer);
      this.searching = true;
      this._searchTimer = setTimeout(async () => {
        try {
          const r = await this.api(`/api/users/search?q=${encodeURIComponent(q)}`);
          const data = await r.json();
          this._searchCache.set(q, data);
          if (this.search.trim() === q) { this.results = data; this.resultsIdx = -1; }
        } catch { this.results = []; }
        finally { this.searching = false; }
      }, 300);
    },
    resultsKeydown(e) {
      const res = this.results;
      if (e.key === 'ArrowDown') { e.preventDefault(); this.resultsIdx = res.length ? Math.min(this.resultsIdx + 1, res.length - 1) : -1; }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.resultsIdx = Math.max(this.resultsIdx - 1, 0); }
      else if (e.key === 'Enter') { e.preventDefault(); const u = res[this.resultsIdx]; if (u) this.confirm(u); else if (this.search.trim().length >= 2) this.onSearchInput(); }
      else if (e.key === 'Escape') { this.results = []; this.resultsIdx = -1; }
    },
    confirm(u) {
      if (this.validation(u).blocked) return;
      if (!this.matched.find(m => m.kuerzel === u.kuerzel)) this.matched.push(u);
      this.search = ''; this.results = []; this.resultsIdx = -1;
      this.$nextTick(() => this.$refs.searchRef?.focus());
    },
    remove(p) { this.matched = this.matched.filter(m => m.kuerzel !== p.kuerzel); },
    entryDate(u) {
      const ch = (u.chapters||[]).find(c => c.chapterId === this.event.chapterId && c.sparte === this.event.sparte)
             || (u.chapters||[]).find(c => c.chapterId === this.event.chapterId);
      return ch?.eintrittsdatum || null;
    },
    validation(u) {
      const chs = u.chapters || [], ch = this.event.chapterId, sp = this.event.sparte;
      if (!ch || !sp) return { ok: true, warn: false, label: '–', cls: 'val-none' };
      const exact = chs.find(c => c.chapterId === ch && c.sparte === sp);
      if (exact) return exact.status === 'aktiv'
        ? { ok: true,  warn: false, label: '✓ Aktiv',        cls: 'val-ok' }
        : { ok: false, warn: true,  label: '⚠ Passiv',       cls: 'val-warn' };
      const otherSparte = chs.find(c => c.chapterId === ch);
      if (otherSparte) return { ok: false, warn: true, label: `⚠ ${this.i18n.sparte(otherSparte.sparte)} · ${this.i18n.chapter(otherSparte.chapterId)}`, cls: 'val-warn' };
      const other = chs.find(c => c.status === 'aktiv') || chs[0];
      if (other) return { ok: false, warn: true, label: `↔ ${this.i18n.chapter(other.chapterId)}`, cls: 'val-other' };
      return { ok: false, warn: false, blocked: true, label: 'Kein Chapter', cls: 'val-blocked' };
    },
    async generateWord() {
      this.generating = true; this.downloadErr = '';
      try {
        const r = await this.api('/api/verify/generate-word', { method: 'POST', body: JSON.stringify({ eventDetails: { ...this.event }, participants: this.matched }) });
        if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
        const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement('a');
        a.href = u; a.download = `freigabe-${this.event.datum}-${this.i18n.sparte(this.event.sparte)}.docx`;
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
      } catch (e) { this.downloadErr = e.message; } finally { this.generating = false; }
    },
    async downloadWord() { await this.generateWord(); if (!this.downloadErr) this.wordDownloaded = true; },
    openMailto() {
      const orgEmails = this.org?.emails || {};
      const zeitstelleEmail = orgEmails.zeitstelle || '';
      const domain = orgEmails.domain || '';
      const ccEmail = domain ? `${this.user.kuerzel}@${domain}` : '';
      const ev = this.event;
      const subject = encodeURIComponent(`Freigabe: ${this.i18n.chapter(ev.chapterId)} – ${this.i18n.sparte(ev.sparte)} – ${ev.datum}`);
      const names = this.matched.map((p, i) => `${i+1}. ${p.vorname} ${p.name} (${p.kuerzel})`).join('\n');
      const attachList = [this.pdfUrl ? '\u2022 Unterschriftenliste (PDF)' : '', '\u2022 Freigabeliste (Word)'].filter(Boolean).join('\n');
      const body = encodeURIComponent(`Freigabeliste\n\nChapter: ${this.i18n.chapter(ev.chapterId)}\nSparte: ${this.i18n.sparte(ev.sparte)}\nDatum: ${ev.datum}\nUhrzeit: ${ev.von} – ${ev.bis}\nOrt: ${ev.ort || '–'}\n\nTeilnehmer (${this.matched.length}):\n${names}\n\nSpartenleiter: ${this.user.vorname} ${this.user.name} (${this.user.kuerzel})\n\n--- Anhänge ---\nBitte fügen Sie die heruntergeladenen Dateien an:\n${attachList}`);
      let href = `mailto:${zeitstelleEmail}?subject=${subject}&body=${body}`;
      if (ccEmail) href += `&cc=${ccEmail}`;
      const a = document.createElement('a'); a.href = href; document.body.appendChild(a); a.click(); a.remove();
    },
    reset() {
      this.step = 1; this.matched = [];
      if (this.pdfUrl) { URL.revokeObjectURL(this.pdfUrl); this.pdfUrl = ''; }
      this.wordDownloaded = false;
      this.$emit('done');
    },
  },
  template: `
<div class="h-full flex flex-col">
  <!-- Step bar -->
  <div class="px-6 py-4 bg-white border-b border-gray-200 flex items-center gap-2 shrink-0">
    <template v-for="(lbl, si) in steps" :key="si">
      <div class="flex items-center gap-2 cursor-pointer" @click="step = si + 1">
        <div :class="step > si + 1 ? 'step-done' : step === si + 1 ? 'step-current' : 'step-pending'"
          class="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors">
          <span v-if="step > si + 1">✓</span><span v-else>{{ si + 1 }}</span>
        </div>
        <span :class="step === si + 1 ? 'step-label-current' : 'step-label-default'" class="text-xs hidden sm:inline transition-colors">{{ lbl }}</span>
      </div>
      <div v-if="si < steps.length - 1" class="flex-1 h-px bg-gray-200"></div>
    </template>
    <button @click="reset" class="ml-auto text-[11px] text-gray-400 hover:text-red-500 px-2 py-1 rounded-md hover:bg-red-50 transition-all whitespace-nowrap flex items-center gap-1">✕ Abbrechen</button>
  </div>

  <!-- Step 1 -->
  <div v-if="step === 1" class="flex-1 overflow-y-auto p-6">
    <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
        <h3 class="font-semibold text-gray-700 mb-4">Unterschriftenliste <span class="text-xs font-normal text-gray-400">(optional)</span></h3>
        <label @dragover.prevent="dragOver=true" @dragleave="dragOver=false" @drop.prevent="onDrop"
          :class="dragOver ? 'drop-active' : 'drop-idle'"
          class="flex-1 flex flex-col items-center justify-center min-h-44 border-2 border-dashed rounded-xl cursor-pointer transition-all">
          <div class="text-center pointer-events-none">
            <div class="text-5xl mb-3">📄</div>
            <div class="text-gray-600 font-medium text-sm">PDF hierher ziehen</div>
            <div class="text-gray-400 text-xs mt-1">oder klicken</div>
          </div>
          <input type="file" accept="application/pdf" class="hidden" @change="uploadPdf" />
        </label>
        <div v-if="uploadError" class="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ uploadError }}</div>
      </div>
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 class="font-semibold text-gray-700 mb-4">Veranstaltungsdetails</h3>
        <div class="space-y-3">
          <template v-if="isSpartenadmin">
            <div class="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm">
              <span class="text-blue-700 font-semibold">{{ i18n.chapter(event.chapterId) }}</span>
              <span class="text-gray-400">·</span>
              <span class="text-blue-600">{{ i18n.sparte(event.sparte) }}</span>
            </div>
          </template>
          <template v-else>
            <div>
              <label class="lbl">Chapter</label>
              <select v-model="event.chapterId" @change="onChapterChange" class="ctrl">
                <option value="">– Wählen –</option>
                <option v-for="ch in prChapters" :key="ch.id" :value="ch.id">{{ i18n.chapter(ch.id) }}</option>
              </select>
            </div>
            <div>
              <label class="lbl">Sparte</label>
              <select v-model="event.sparte" class="ctrl" :disabled="!event.chapterId">
                <option value="">– Wählen –</option>
                <option v-for="sp in sparten" :key="sp.id" :value="sp.id">{{ sp.name || sp.id }}</option>
              </select>
            </div>
          </template>
          <div><label class="lbl">Datum</label><input v-model="event.datum" type="date" class="ctrl" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="lbl">Von</label><input v-model="event.von" type="time" class="ctrl" /></div>
            <div><label class="lbl">Bis</label><input v-model="event.bis" type="time" class="ctrl" /></div>
          </div>
          <div><label class="lbl">Ort</label><input v-model="event.ort" type="text" placeholder="Turnhalle Süd" class="ctrl" /></div>
          <button @click="step = 2" :disabled="!event.chapterId || !event.sparte || !event.datum" class="btn-sm w-full mt-2">Weiter zu Schritt 2 →</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 2 -->
  <div v-if="step === 2" class="flex-1 flex flex-col min-h-0">
    <div class="px-6 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between text-xs shrink-0 flex-wrap gap-2">
      <div class="flex items-center gap-4 text-gray-500">
        <span>📅 {{ event.datum }}</span>
        <span>🏢 {{ i18n.chapter(event.chapterId) }}</span>
        <span>🏓 {{ i18n.sparte(event.sparte) }}</span>
        <span v-if="event.ort">📍 {{ event.ort }}</span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-blue-600 font-semibold">{{ matched.length }} bestätigt</span>
        <button @click="step = 1" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
        <button @click="step = 3" :disabled="matched.length === 0" class="btn-sm">Abschließen →</button>
      </div>
    </div>
    <div :class="pdfUrl ? 'grid grid-cols-1 lg:grid-cols-2' : 'flex flex-col max-w-3xl mx-auto w-full'" class="flex-1 min-h-0 overflow-hidden">
      <div v-if="pdfUrl" class="flex flex-col border-r border-gray-200 min-h-0 bg-white">
        <div class="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold text-gray-500 shrink-0">UNTERSCHRIFTENLISTE (PDF)</div>
        <iframe :src="pdfUrl" class="flex-1 w-full border-0"></iframe>
      </div>
      <div class="flex flex-col min-h-0 overflow-y-auto p-4 gap-3 bg-white">
        <div class="shrink-0">
          <div class="relative">
            <input v-model="search" @input="onSearchInput" @keydown="resultsKeydown" ref="searchRef"
              placeholder="Teilnehmer suchen — Name oder Kürzel tippen …" class="ctrl text-sm w-full pr-8" autocomplete="off" />
            <span v-if="searching" class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">…</span>
          </div>
          <div v-if="results.length" class="mt-1 border border-gray-200 rounded-lg overflow-hidden max-h-52 overflow-y-auto">
            <div v-for="(u, idx) in results" :key="u.kuerzel" @click="confirm(u)"
              :class="(matched.find(m => m.kuerzel === u.kuerzel) || validation(u).blocked) ? 'pick-disabled' : idx === resultsIdx ? 'pick-highlight' : ''"
              class="flex items-center justify-between px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 transition-colors cursor-pointer hover:bg-blue-50">
              <div class="flex items-center gap-3">
                <span class="font-medium text-gray-800">{{ u.vorname }} {{ u.name }}</span>
                <span class="text-gray-400 text-xs font-mono">{{ u.kuerzel }}</span>
                <span :class="validation(u).cls" class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold">{{ validation(u).label }}</span>
              </div>
              <span v-if="!validation(u).blocked" class="text-green-600 font-bold text-base leading-none">+</span>
              <span v-else class="text-red-400 text-xs">✕</span>
            </div>
          </div>
          <div v-else-if="search.length >= 2 && !searching" class="mt-1 text-gray-400 text-xs text-center py-2">Kein Treffer.</div>
        </div>
        <div class="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
          <div class="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between text-xs">
            <span class="font-semibold text-gray-500 uppercase tracking-wide">Bestätigt</span>
            <span class="text-blue-600 font-semibold">{{ matched.length }} Teilnehmer</span>
          </div>
          <div v-if="!matched.length" class="text-center text-gray-300 text-sm py-8">Noch keine Zuordnung — oben suchen und hinzufügen.</div>
          <table v-else class="w-full text-sm">
            <thead class="bg-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th class="px-4 py-2 text-left w-8">#</th>
                <th class="px-4 py-2 text-left">Name</th>
                <th class="px-4 py-2 text-left">Kürzel</th>
                <th class="px-4 py-2 text-left">Mitgliedschaft</th>
                <th class="px-4 py-2 text-left">Eintritt</th>
                <th class="px-4 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(p, pi) in matched" :key="p.kuerzel"
                :class="validation(p).ok ? '' : validation(p).warn ? 'row-warn' : 'row-error'"
                class="border-t border-gray-100 hover:bg-white transition-colors">
                <td class="px-4 py-2 text-gray-400 text-xs">{{ pi + 1 }}</td>
                <td class="px-4 py-2 font-medium text-gray-800">{{ p.vorname }} {{ p.name }}</td>
                <td class="px-4 py-2 font-mono text-gray-500 text-xs">{{ p.kuerzel }}</td>
                <td class="px-4 py-2"><span :class="validation(p).cls" class="px-2 py-0.5 rounded-full text-[11px] font-semibold">{{ validation(p).label }}</span></td>
                <td class="px-4 py-2 text-gray-400 text-xs">{{ entryDate(p) || '–' }}</td>
                <td class="px-4 py-2 text-right"><button @click="remove(p)" class="text-red-400 hover:text-red-600 text-xs">✕</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Step 3 -->
  <div v-if="step === 3" class="flex-1 overflow-y-auto p-6">
    <div class="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-8">
      <div class="text-center mb-6">
        <div class="text-4xl mb-2">📋</div>
        <h2 class="text-lg font-bold text-gray-800">Zeitkorrektur vorbereiten</h2>
        <p class="text-gray-500 text-sm">{{ matched.length }} Teilnehmer — Chapter-Mitgliedschaft geprüft</p>
      </div>
      <div class="bg-gray-50 rounded-lg p-4 mb-6 text-sm grid grid-cols-2 gap-2 text-gray-700">
        <div><b>Chapter:</b> {{ i18n.chapter(event.chapterId) }}</div>
        <div><b>Sparte:</b> {{ i18n.sparte(event.sparte) }}</div>
        <div><b>Datum:</b> {{ event.datum }}</div>
        <div><b>Uhrzeit:</b> {{ event.von }} – {{ event.bis }}</div>
        <div class="col-span-2"><b>Ort:</b> {{ event.ort || '–' }}</div>
      </div>
      <div v-if="matched.some(p => !validation(p).ok)" class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
        ⚠️ Einige Teilnehmer haben keine aktive Mitgliedschaft im gewählten Chapter/Sparte.
      </div>
      <table class="w-full text-xs mb-6">
        <thead class="bg-blue-700 text-white"><tr>
          <th class="px-3 py-2 text-left">Nr.</th><th class="px-3 py-2 text-left">Kürzel</th>
          <th class="px-3 py-2 text-left">Name</th><th class="px-3 py-2 text-left">Vorname</th>
          <th class="px-3 py-2 text-left">Mitgliedschaft</th>
        </tr></thead>
        <tbody>
          <tr v-for="(p, i) in matched" :key="p.kuerzel"
            :class="!validation(p).ok ? (validation(p).warn ? 'row-warn' : 'row-error') : ''" class="border-t">
            <td class="px-3 py-1.5 text-gray-500">{{ i + 1 }}</td>
            <td class="px-3 py-1.5 font-mono text-gray-600">{{ p.kuerzel }}</td>
            <td class="px-3 py-1.5">{{ p.name }}</td>
            <td class="px-3 py-1.5">{{ p.vorname }}</td>
            <td class="px-3 py-1.5"><span :class="validation(p).cls" class="px-1.5 py-0.5 rounded-full text-[10px] font-semibold">{{ validation(p).label }}</span></td>
          </tr>
        </tbody>
      </table>
      <div v-if="downloadErr" class="mb-4 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ downloadErr }}</div>
      <div v-if="wordDownloaded || pdfDownloaded" class="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-xs flex items-center gap-2">
        <span class="text-base">📁</span>
        <span>Datei gespeichert — bitte aus dem <b>Downloads-Ordner</b> in die E-Mail ziehen.</span>
      </div>
      <div class="flex gap-3 justify-center flex-wrap">
        <button @click="downloadWord" :disabled="generating" class="btn flex items-center gap-2">
          {{ generating ? 'Erstelle …' : '📤 Freigabeliste erstellen (Word)' }}
        </button>
        <a v-if="pdfUrl" :href="pdfUrl" :download="'unterschriftenliste-' + event.datum + '.pdf'" @click="pdfDownloaded = true" class="btn-sec flex items-center gap-2">📄 Unterschriftenliste (PDF)</a>
        <button @click="openMailto" class="btn-sec flex items-center gap-2">✉ Per E-Mail an Zeitstelle</button>
        <button @click="step = 2" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
      </div>
    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.PruefeWizard = PruefeWizard;
