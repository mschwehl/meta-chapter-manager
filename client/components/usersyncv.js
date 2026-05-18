/**
 * <org-usersyncv> — Extra sync page for LDAP/file imports
 *
 * Merge users by primary key `kuerzel` using CSV or JSON input.
 * Supports dry-run preview before writing.
 *
 * Inject: api, isOrgaAdmin
 */
const OrgUserSyncV = {
  name: 'OrgUserSyncV',
  inject: ['api', 'isOrgaAdmin'],
  emits: ['back'],
  data() {
    return {
      inputText: '',
      fileName: '',
      dryRun: true,
      syncing: false,
      parseError: '',
      error: '',
      previewRows: [],
      syncResult: null,
    };
  },
  methods: {
    detectCsvDelimiter(line) {
      const candidates = [';', ',', '\t'];
      let best = ';';
      let bestCount = -1;
      for (const c of candidates) {
        const count = line.split(c).length - 1;
        if (count > bestCount) {
          best = c;
          bestCount = count;
        }
      }
      return best;
    },
    parseCsvRow(line, delimiter) {
      const out = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (quoted && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else {
            quoted = !quoted;
          }
          continue;
        }
        if (ch === delimiter && !quoted) {
          out.push(cell.trim());
          cell = '';
          continue;
        }
        cell += ch;
      }
      out.push(cell.trim());
      return out;
    },
    normalizeCsvHeader(raw) {
      const key = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
      if (['kuerzel', 'kürzel', 'kurzel', 'username', 'login', 'user'].includes(key)) return 'kuerzel';
      if (['vorname', 'firstname', 'givenname', 'first'].includes(key)) return 'vorname';
      if (['name', 'nachname', 'surname', 'lastname', 'familienname', 'last'].includes(key)) return 'name';
      if (['orgeinheit', 'organisationseinheit', 'orgunit', 'oe', 'abteilung', 'department', 'referat'].includes(key)) return 'orgeinheit';
      if (['email', 'emailadresse', 'mail'].includes(key)) return 'email';
      return key;
    },
    parseCsvUsers(csvText) {
      const lines = String(csvText || '')
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);
      if (!lines.length) return [];

      const delimiter = this.detectCsvDelimiter(lines[0]);
      const parsed = lines.map(line => this.parseCsvRow(line, delimiter));
      const headerCandidate = (parsed[0] || []).map(h => this.normalizeCsvHeader(h));
      const known = new Set(['kuerzel', 'vorname', 'name', 'orgeinheit', 'email']);
      const hasHeader = headerCandidate.filter(h => known.has(h)).length >= 2;

      const headers = hasHeader ? headerCandidate : ['kuerzel', 'vorname', 'name', 'orgeinheit', 'email'];
      const rows = hasHeader ? parsed.slice(1) : parsed;
      const lineOffset = hasHeader ? 2 : 1;

      return rows.map((cells, idx) => {
        const row = { __line: lineOffset + idx };
        headers.forEach((h, i) => { row[h] = String(cells[i] || '').trim(); });
        return row;
      });
    },
    deriveKuerzelFromEmail(email, lineNo) {
      let local = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!local) local = `u${lineNo}`;
      if (!/^[a-z]/.test(local)) local = `u${local}`;
      if (local.length < 4) local = `${local}${'0000'.slice(0, 4 - local.length)}`;
      return local.slice(0, 5);
    },
    normalizeUserRow(row = {}, lineNo = 0) {
      const email = String(row.email || '').trim();
      let kuerzel = String(row.kuerzel || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!kuerzel && email) kuerzel = this.deriveKuerzelFromEmail(email, lineNo);

      const kontakte = Array.isArray(row.kontakte)
        ? row.kontakte
        : email
          ? [{ typ: 'email', wert: email, attribut: 'business' }]
          : [];

      return {
        kuerzel,
        vorname: String(row.vorname || '').trim(),
        name: String(row.name || '').trim(),
        orgeinheit: String(row.orgeinheit || '').trim(),
        kontakte,
      };
    },
    parseInputUsers() {
      const raw = String(this.inputText || '').trim();
      if (!raw) return [];

      // JSON input: [ {...}, ... ] or { users:[...] }
      if (raw.startsWith('[') || raw.startsWith('{')) {
        const parsed = JSON.parse(raw);
        const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.users) ? parsed.users : null;
        if (!rows) throw new Error('JSON muss ein Array oder Objekt mit users[] sein.');
        return rows.map((r, idx) => this.normalizeUserRow(r, idx + 1)).filter(u => u.kuerzel || u.name || u.vorname);
      }

      // CSV input
      const rows = this.parseCsvUsers(raw);
      return rows.map(r => this.normalizeUserRow(r, r.__line || 0)).filter(u => u.kuerzel || u.name || u.vorname);
    },
    async onFilePicked(event) {
      this.error = '';
      this.parseError = '';
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        this.fileName = file.name;
        this.inputText = await file.text();
        this.previewInput();
      } catch (e) {
        this.error = e.message;
      }
    },
    previewInput() {
      this.error = '';
      this.parseError = '';
      this.syncResult = null;
      try {
        const users = this.parseInputUsers();
        this.previewRows = users.slice(0, 25);
      } catch (e) {
        this.previewRows = [];
        this.parseError = e.message;
      }
    },
    async runSync() {
      this.error = '';
      this.parseError = '';
      this.syncResult = null;
      let users;
      try {
        users = this.parseInputUsers();
      } catch (e) {
        this.parseError = e.message;
        return;
      }
      if (!users.length) {
        this.error = 'Keine Benutzerdaten gefunden.';
        return;
      }

      this.syncing = true;
      try {
        const r = await this.api('/api/orga/usersyncv', {
          method: 'POST',
          body: JSON.stringify({ users, dryRun: this.dryRun }),
        });
        const data = await r.json();
        if (!r.ok) {
          this.error = data.error || 'Sync fehlgeschlagen';
          return;
        }
        this.syncResult = data;
      } catch (e) {
        this.error = e.message;
      } finally {
        this.syncing = false;
      }
    },
  },
  template: `
<div class="p-6 max-w-5xl mx-auto space-y-5">
  <div class="flex items-center gap-3">
    <button @click="$emit('back')" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
    <div>
      <h1 class="text-xl font-bold text-gray-800">Org.UserSyncV</h1>
      <p class="text-xs text-gray-500">Extra Sync-Seite: Merge per Datei, PK = Kürzel</p>
    </div>
  </div>

  <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
    <div class="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
      CSV oder JSON hochladen/einfügen. Beim Sync werden Benutzer per Kürzel gemerged (neu anlegen oder bestehende aktualisieren).
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label class="lbl">Datei hochladen</label>
        <input type="file" accept=".csv,.json,.txt,application/json,text/csv,text/plain" @change="onFilePicked" class="ctrl text-xs" />
        <div v-if="fileName" class="text-[11px] text-gray-500 mt-1">Datei: {{ fileName }}</div>
      </div>
      <div class="flex items-end gap-3">
        <label class="inline-flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" v-model="dryRun" />
          Dry-Run (nur Vorschau, keine Writes)
        </label>
      </div>
    </div>

    <div>
      <label class="lbl">Daten (CSV oder JSON)</label>
      <textarea v-model="inputText" @input="previewInput" rows="10" class="ctrl text-xs font-mono" placeholder="kuerzel;vorname;name;orgeinheit;email"></textarea>
    </div>

    <div class="flex flex-wrap gap-2">
      <button @click="previewInput" class="btn-sec text-xs">Vorschau aktualisieren</button>
      <button @click="runSync" :disabled="syncing" class="btn-sm text-xs">{{ syncing ? 'Sync läuft …' : (dryRun ? 'Dry-Run ausführen' : 'Merge starten') }}</button>
    </div>

    <div v-if="parseError" class="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ parseError }}</div>
    <div v-if="error" class="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ error }}</div>
  </div>

  <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
    <div class="text-sm font-semibold text-gray-700 mb-3">Vorschau (max. 25)</div>
    <div v-if="!previewRows.length" class="text-xs text-gray-400">Keine Daten geladen.</div>
    <div v-else class="overflow-x-auto rounded-lg border border-gray-100">
      <table class="w-full min-w-[36rem] text-xs">
        <thead class="bg-gray-50 text-gray-500 uppercase tracking-wide">
          <tr>
            <th class="px-3 py-2 text-left">Kürzel</th>
            <th class="px-3 py-2 text-left">Vorname</th>
            <th class="px-3 py-2 text-left">Name</th>
            <th class="px-3 py-2 text-left">Organisationseinheit</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in previewRows" :key="u.kuerzel + '|' + u.name + '|' + u.vorname" class="border-t border-gray-50">
            <td class="px-3 py-2 font-mono text-gray-600">{{ u.kuerzel || '—' }}</td>
            <td class="px-3 py-2 text-gray-700">{{ u.vorname || '—' }}</td>
            <td class="px-3 py-2 text-gray-800">{{ u.name || '—' }}</td>
            <td class="px-3 py-2 text-gray-500">{{ u.orgeinheit || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-if="syncResult" class="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
    <div class="text-sm font-semibold text-gray-700">Sync-Ergebnis</div>
    <div class="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
      <div class="bg-gray-50 rounded p-2"><div class="text-gray-400">Total</div><div class="font-semibold">{{ syncResult.total }}</div></div>
      <div class="bg-gray-50 rounded p-2"><div class="text-gray-400">Processed</div><div class="font-semibold">{{ syncResult.processed }}</div></div>
      <div class="bg-green-50 rounded p-2"><div class="text-green-600">Created</div><div class="font-semibold text-green-700">{{ syncResult.created }}</div></div>
      <div class="bg-blue-50 rounded p-2"><div class="text-blue-600">Updated</div><div class="font-semibold text-blue-700">{{ syncResult.updated }}</div></div>
      <div class="bg-slate-50 rounded p-2"><div class="text-slate-500">Unchanged</div><div class="font-semibold text-slate-700">{{ syncResult.unchanged }}</div></div>
      <div class="bg-red-50 rounded p-2"><div class="text-red-600">Failed</div><div class="font-semibold text-red-700">{{ syncResult.failed }}</div></div>
    </div>
    <div v-if="syncResult.errors && syncResult.errors.length" class="rounded-lg border border-red-200 bg-red-50 p-3">
      <div class="text-xs font-semibold text-red-700 mb-1">Fehler</div>
      <ul class="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
        <li v-for="(err, idx) in syncResult.errors" :key="idx">{{ err }}</li>
      </ul>
    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.OrgUserSyncV = OrgUserSyncV;
