/**
 * <user-admin> — Global user management (OrgaAdmin only)
 *
 * Full user list, create new users (with duplicate check),
 * edit name/vorname, view chapter memberships.
 *
 * Inject: api, apiPost, apiPut, i18n, user, prChapters, isOrgaAdmin, isActive
 */
const UserAdmin = {
  name: 'UserAdmin',
  inject: ['api', 'apiPost', 'apiPut', 'i18n', 'user', 'prChapters', 'isOrgaAdmin', 'isActive', 'sseEvent'],
  data() {
    return {
      users: [],
      orgAdmins: [],
      loading: false,
      filter: '',
      selected: null,
      creating: false,
      form: { kuerzel: '', name: '', vorname: '', kontakte: [] },
      edit: null,
      error: '',
      sortBy: 'kuerzel',
      sortAsc: true,
    };
  },
  computed: {
    filtered() {
      let list = this.users;
      const q = this.filter.toLowerCase().trim();
      if (q) {
        list = list.filter(u =>
          u.kuerzel.toLowerCase().includes(q) ||
          (u.name || '').toLowerCase().includes(q) ||
          (u.vorname || '').toLowerCase().includes(q)
        );
      }
      const key = this.sortBy;
      const dir = this.sortAsc ? 1 : -1;
      return [...list].sort((a, b) => {
        const va = (a[key] || '').toLowerCase();
        const vb = (b[key] || '').toLowerCase();
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    },
    kuerzelTaken() {
      if (!this.form.kuerzel) return false;
      return this.users.some(u => u.kuerzel === this.form.kuerzel.toLowerCase());
    },
    kuerzelValid() {
      return /^[a-z][a-z0-9]{3,4}$/.test(this.form.kuerzel);
    },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [uRes, oRes] = await Promise.all([this.api('/api/admin/users'), this.api('/api/orga')]);
        this.users = await uRes.json();
        const org = await oRes.json();
        this.orgAdmins = org.orgAdmins || [];
      } catch {} finally { this.loading = false; }
    },
    async toggleOrgAdmin(kuerzel) {
      const isAdmin = this.orgAdmins.includes(kuerzel);
      const next = isAdmin
        ? this.orgAdmins.filter(k => k !== kuerzel)
        : [...this.orgAdmins, kuerzel];
      try {
        const r = await this.apiPut('/api/orga', { orgAdmins: next });
        if (r.ok) { this.orgAdmins = next; }
      } catch {}
    },
    toggleSort(key) {
      if (this.sortBy === key) this.sortAsc = !this.sortAsc;
      else { this.sortBy = key; this.sortAsc = true; }
    },
    sortIcon(key) {
      if (this.sortBy !== key) return '↕';
      return this.sortAsc ? '↑' : '↓';
    },
    select(u) {
      this.selected = u;
      this.creating = false;
      this.edit = null;
      this.error = '';
    },
    startCreate() {
      this.selected = null;
      this.creating = true;
      this.form = { kuerzel: '', name: '', vorname: '', kontakte: [] };
      this.error = '';
    },
    startEdit() {
      if (!this.selected) return;
      this.edit = { name: this.selected.name, vorname: this.selected.vorname, kontakte: JSON.parse(JSON.stringify(this.selected.kontakte || [])) };
      this.error = '';
    },
    async createUser() {
      this.error = '';
      if (!this.kuerzelValid) { this.error = 'Kürzel muss 4–5 Zeichen haben (a–z und Ziffern, beginnt mit Buchstabe)'; return; }
      if (this.kuerzelTaken) { this.error = `Kürzel "${this.form.kuerzel}" ist bereits vergeben`; return; }
      try {
        const r = await this.apiPost('/api/admin/users', this.form);
        if (!r.ok) { this.error = (await r.json()).error; return; }
        const created = await r.json();
        this.creating = false;
        await this.load();
        this.selected = this.users.find(u => u.kuerzel === created.kuerzel) || created;
      } catch (e) { this.error = e.message; }
    },
    async saveEdit() {
      this.error = '';
      try {
        const r = await this.apiPut(`/api/admin/users/${this.selected.kuerzel}`, this.edit);
        if (!r.ok) { this.error = (await r.json()).error; return; }
        const updated = await r.json();
        this.edit = null;
        await this.load();
        this.selected = this.users.find(u => u.kuerzel === updated.kuerzel) || updated;
      } catch (e) { this.error = e.message; }
    },
    cancelEdit() { this.edit = null; this.error = ''; },
    cancelCreate() { this.creating = false; this.error = ''; },
    chapterCount(u) { return (u.chapters || []).filter(c => c.status === 'aktiv').length; },
    totalChapters(u) { return (u.chapters || []).length; },
    async exportExcel() {
      const r = await this.api('/api/admin/export/users.xlsx');
      if (!r.ok) return;
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'mitglieder.xlsx'; a.click();
      URL.revokeObjectURL(url);
    },
  },
  watch: {
    sseEvent(evt) {
      if (!evt) return;
      if (evt.category === 'user') this.load();
    },
  },
  mounted() { this.load(); },
  emits: ['back'],
  template: `
<div class="h-full flex flex-col max-w-6xl mx-auto w-full">
  <!-- Header -->
  <div class="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
    <div class="flex items-center gap-3">
      <button @click="$emit('back')" class="btn-back">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück
      </button>
      <div>
        <h1 class="text-lg font-bold text-gray-800">Benutzerverwaltung</h1>
        <p class="text-gray-500 text-xs mt-0.5">{{ users.length }} Benutzer im System</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <button @click="exportExcel" class="btn-sec text-xs flex items-center gap-1.5" title="Excel-Export">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>
        Excel
      </button>
      <button @click="startCreate" class="btn-sm flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
        Neuer Benutzer
      </button>
    </div>
  </div>

  <div class="flex-1 flex min-h-0">
    <!-- List -->
    <div class="flex flex-col border-r border-gray-200 bg-white" :class="(selected || creating) ? 'hidden lg:flex lg:w-1/2 xl:w-2/5' : 'w-full lg:w-1/2 xl:w-2/5'">
      <div class="px-4 py-3 border-b border-gray-100 shrink-0">
        <input v-model="filter" placeholder="Suchen … (Name oder Kürzel)" class="ctrl text-xs w-full" />
      </div>
      <div class="flex-1 overflow-y-auto">
        <div v-if="loading" class="p-6 text-center text-gray-400 text-xs animate-pulse">Laden …</div>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider sticky top-0">
            <tr>
              <th class="px-4 py-2 text-left cursor-pointer hover:text-gray-700" @click="toggleSort('kuerzel')">
                Kürzel <span class="text-[9px]">{{ sortIcon('kuerzel') }}</span>
              </th>
              <th class="px-4 py-2 text-left cursor-pointer hover:text-gray-700" @click="toggleSort('name')">
                Nachname <span class="text-[9px]">{{ sortIcon('name') }}</span>
              </th>
              <th class="px-4 py-2 text-left cursor-pointer hover:text-gray-700" @click="toggleSort('vorname')">
                Vorname <span class="text-[9px]">{{ sortIcon('vorname') }}</span>
              </th>
              <th class="px-4 py-2 text-center">Mitgl.</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in filtered" :key="u.kuerzel" @click="select(u)"
              :class="selected?.kuerzel === u.kuerzel ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent hover:bg-gray-50'"
              class="border-b border-gray-50 cursor-pointer transition-colors">
              <td class="px-4 py-2.5 font-mono text-xs text-gray-600">{{ u.kuerzel }}</td>
              <td class="px-4 py-2.5 text-gray-800">{{ u.name || '–' }}</td>
              <td class="px-4 py-2.5 text-gray-600">{{ u.vorname || '–' }}</td>
              <td class="px-4 py-2.5 text-center">
                <span v-if="chapterCount(u)" class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">{{ chapterCount(u) }}</span>
                <span v-else class="text-gray-300 text-xs">–</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!loading && !filtered.length" class="p-6 text-center text-gray-300 text-xs">Keine Treffer</div>
      </div>
      <div class="px-4 py-2 border-t border-gray-100 text-[10px] text-gray-400 shrink-0">{{ filtered.length }} / {{ users.length }} Benutzer</div>
    </div>

    <!-- Detail / Create -->
    <div class="flex-1 overflow-y-auto bg-gray-50 min-h-0" :class="(selected || creating) ? 'flex' : 'hidden lg:flex'">
      <div v-if="!selected && !creating" class="flex items-center justify-center w-full">
        <div class="text-center space-y-4 p-8">
          <div class="w-16 h-16 rounded-2xl bg-blue-50 text-blue-400 flex items-center justify-center mx-auto">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
          </div>
          <div>
            <p class="text-gray-500 text-sm">Benutzer aus der Liste auswählen</p>
            <p class="text-gray-400 text-xs mt-1">oder neuen Benutzer anlegen</p>
          </div>
          <button @click="startCreate" class="btn-sm inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Neuer Benutzer
          </button>
        </div>
      </div>

      <!-- Create form -->
      <div v-if="creating" class="p-6 w-full max-w-xl mx-auto">
        <button @click="cancelCreate" class="lg:hidden flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Zurück zur Liste
        </button>
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <span class="text-base">👤</span>
            <h3 class="font-semibold text-gray-800 text-sm">Neuen Benutzer anlegen</h3>
          </div>
          <div class="px-6 py-5 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label class="lbl">Kürzel</label>
                <input v-model="form.kuerzel" class="ctrl" placeholder="z.B. m123 (4–5 Zeichen)" maxlength="5" />
                <p v-if="form.kuerzel && !kuerzelValid" class="mt-1 text-[10px] text-red-500">4–5 Zeichen, beginnt mit Buchstabe (a–z, 0–9)</p>
                <p v-if="kuerzelTaken" class="mt-1 text-[10px] text-red-500 font-semibold">⚠ Dieses Kürzel ist bereits vergeben!</p>
              </div>
              <div>
                <label class="lbl">Nachname</label>
                <input v-model="form.name" class="ctrl" />
              </div>
              <div>
                <label class="lbl">Vorname</label>
                <input v-model="form.vorname" class="ctrl" />
              </div>
            </div>
            <div>
              <label class="lbl">Kontakte</label>
              <div v-for="(k, idx) in form.kontakte" :key="idx" class="mb-2 p-2 border border-gray-100 rounded-lg bg-gray-50 dark:bg-[#1a1d27] dark:border-[#2d3148]">
                <div class="flex items-center gap-2 mb-1">
                  <select v-model="k.typ" class="ctrl text-xs flex-1">
                    <option value="email">E-Mail</option>
                    <option value="telefon">Telefon</option>
                    <option value="postadresse">Postadresse</option>
                  </select>
                  <button @click="form.kontakte.splice(idx, 1)" type="button" class="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                </div>
                <input v-model="k.wert" class="ctrl" :placeholder="k.typ === 'email' ? 'max@example.de' : k.typ === 'telefon' ? '+49 …' : 'Straße, PLZ Ort'" />
              </div>
              <button @click="form.kontakte.push({ typ: 'email', wert: '' })" type="button" class="text-blue-600 hover:text-blue-800 text-xs font-medium mt-1">+ Kontakt hinzufügen</button>
            </div>
            <p class="text-gray-400 text-xs">Initial-Passwort = Kürzel (muss beim ersten Login geändert werden).</p>
            <div v-if="error" class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{{ error }}</div>
            <div class="flex gap-2">
              <button @click="createUser" :disabled="!kuerzelValid || kuerzelTaken || !form.name"
                class="btn-sm disabled:opacity-40 disabled:cursor-not-allowed">Anlegen</button>
              <button @click="cancelCreate" class="btn-sec text-xs">Abbrechen</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Detail card -->
      <div v-if="selected && !creating" class="p-6 w-full max-w-xl mx-auto space-y-4">
        <button @click="selected = null" class="lg:hidden flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Zurück zur Liste
        </button>
        <!-- User info -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                {{ (selected.vorname || '?')[0] }}{{ (selected.name || '?')[0] }}
              </div>
              <div>
                <div class="font-semibold text-gray-800 text-sm">{{ selected.vorname }} {{ selected.name }}</div>
                <div class="font-mono text-[11px] text-gray-400">{{ selected.kuerzel }}</div>
                <div v-if="selected.kontakte && selected.kontakte.length" class="text-[11px] text-gray-400">
                  <div v-for="k in selected.kontakte" :key="k.typ + k.wert">{{ k.typ }}: {{ k.wert }}</div>
                </div>
                <!-- Org-Admin badge -->
                <span v-if="orgAdmins.includes(selected.kuerzel)"
                  class="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                  🏛 Organisations-Admin
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <!-- Org-Admin toggle (only orgaAdmin, can't demote yourself) -->
              <button v-if="isOrgaAdmin && selected.kuerzel !== user.kuerzel"
                @click="toggleOrgAdmin(selected.kuerzel)"
                :class="orgAdmins.includes(selected.kuerzel)
                  ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'"
                class="text-[11px] font-medium px-2.5 py-1 rounded-lg transition-all"
                :title="orgAdmins.includes(selected.kuerzel) ? 'Org-Admin-Rechte entziehen' : 'Zum Org-Admin ernennen'">
                {{ orgAdmins.includes(selected.kuerzel) ? '− Org-Admin' : '+ Org-Admin' }}
              </button>
              <button v-if="!edit" @click="startEdit" class="text-blue-600 text-xs font-medium hover:underline">Bearbeiten</button>
            </div>
          </div>
          <!-- Edit mode -->
          <div v-if="edit" class="px-6 py-5 space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div><label class="lbl">Nachname</label><input v-model="edit.name" class="ctrl" /></div>
              <div><label class="lbl">Vorname</label><input v-model="edit.vorname" class="ctrl" /></div>
            </div>
            <div>
              <label class="lbl">Kontakte</label>
              <div v-for="(k, idx) in edit.kontakte" :key="idx" class="mb-2 p-2 border border-gray-100 rounded-lg bg-gray-50 dark:bg-[#1a1d27] dark:border-[#2d3148]">
                <div class="flex items-center gap-2 mb-1">
                  <select v-model="k.typ" class="ctrl text-xs flex-1">
                    <option value="email">E-Mail</option>
                    <option value="telefon">Telefon</option>
                    <option value="postadresse">Postadresse</option>
                  </select>
                  <button @click="edit.kontakte.splice(idx, 1)" type="button" class="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                </div>
                <input v-model="k.wert" class="ctrl" :placeholder="k.typ === 'email' ? 'max@example.de' : k.typ === 'telefon' ? '+49 …' : 'Straße, PLZ Ort'" />
              </div>
              <button @click="edit.kontakte.push({ typ: 'email', wert: '' })" type="button" class="text-blue-600 hover:text-blue-800 text-xs font-medium mt-1">+ Kontakt hinzufügen</button>
            </div>
            <div v-if="error" class="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">{{ error }}</div>
            <div class="flex gap-2">
              <button @click="saveEdit" class="btn-sm">Speichern</button>
              <button @click="cancelEdit" class="btn-sec text-xs">Abbrechen</button>
            </div>
          </div>
        </div>

        <!-- Memberships -->
        <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <span class="text-base">🏅</span>
            <h3 class="font-semibold text-gray-800 text-sm">Mitgliedschaften</h3>
          </div>
          <div v-if="!selected.chapters || !selected.chapters.length" class="px-6 py-6 text-center text-gray-400 text-xs">
            Keine Mitgliedschaften vorhanden.
          </div>
          <div v-else class="divide-y divide-gray-100">
            <div v-for="ch in selected.chapters" :key="ch.chapterId + ch.sparte" class="px-6 py-3 flex items-center justify-between text-sm">
              <div class="flex items-center gap-3">
                <span :class="isActive(ch) ? 'bg-green-400' : 'bg-gray-300'" class="w-2 h-2 rounded-full shrink-0"></span>
                <div>
                  <span class="font-medium text-gray-800">{{ i18n.chapter(ch.chapterId) }}</span>
                  <span class="text-gray-400 mx-1">·</span>
                  <span class="text-gray-600">{{ i18n.sparte(ch.sparte) }}</span>
                </div>
              </div>
              <div class="flex items-center gap-3 text-xs text-gray-400">
                <span v-if="ch.eintrittsdatum">{{ ch.eintrittsdatum }}</span>
                <span v-if="ch.austrittsdatum">→ {{ ch.austrittsdatum }}</span>
                <span :class="isActive(ch) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
                  class="px-2 py-0.5 rounded-full text-[10px] font-semibold">{{ ch.status || (isActive(ch) ? 'aktiv' : 'inaktiv') }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.UserAdmin = UserAdmin;
