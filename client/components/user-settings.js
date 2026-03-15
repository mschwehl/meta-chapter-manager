/**
 * <user-settings> — Password change + account info + role badges
 *
 * Inject: apiPost, i18n, user, isOrgaAdmin, isZeitstelle
 */
const UserSettings = {
  name: 'UserSettings',
  inject: ['apiPost', 'i18n', 'user', 'isOrgaAdmin', 'isZeitstelle'],
  emits: ['passwordChanged'],
  data() {
    return {
      pwForm: { current: '', newPw: '', confirm: '' },
      pwError: '',
      pwSuccess: '',
    };
  },
  methods: {
    async pwChange() {
      this.pwError = ''; this.pwSuccess = '';
      if (this.pwForm.newPw !== this.pwForm.confirm) { this.pwError = 'Passwörter stimmen nicht überein.'; return; }
      try {
        const r = await this.apiPost('/api/auth/change-password', { currentPassword: this.pwForm.current, newPassword: this.pwForm.newPw });
        if (!r.ok) { this.pwError = (await r.json()).error; return; }
        this.pwSuccess = 'Passwort geändert.';
        this.pwForm.current = ''; this.pwForm.newPw = ''; this.pwForm.confirm = '';
        this.$emit('passwordChanged');
      } catch (e) { this.pwError = e.message; }
    },
  },
  template: `
<div class="p-6 max-w-5xl mx-auto">
  <h1 class="text-xl font-bold text-gray-800 mb-6">Einstellungen</h1>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

    <!-- Left column: password change -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <span class="text-base">🔑</span>
        <h3 class="font-semibold text-gray-800 text-sm">Passwort ändern</h3>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div>
          <label class="lbl">Aktuelles Passwort</label>
          <input v-model="pwForm.current" type="password" autocomplete="current-password" class="ctrl" placeholder="••••••••" />
        </div>
        <div>
          <label class="lbl">Neues Passwort</label>
          <input v-model="pwForm.newPw" type="password" autocomplete="new-password" class="ctrl" placeholder="Mindestens 8 Zeichen" />
        </div>
        <div>
          <label class="lbl">Bestätigung</label>
          <input v-model="pwForm.confirm" type="password" autocomplete="new-password" class="ctrl" placeholder="Passwort wiederholen" />
          <p v-if="pwForm.confirm && pwForm.newPw !== pwForm.confirm" class="mt-1 text-[11px] text-red-500">Passwörter stimmen nicht überein</p>
        </div>
        <div v-if="pwError" class="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">{{ pwError }}</div>
        <div v-if="pwSuccess" class="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs flex items-center gap-2"><span>✓</span>{{ pwSuccess }}</div>
        <button @click="pwChange"
          :disabled="!pwForm.current || !pwForm.newPw || pwForm.newPw !== pwForm.confirm"
          class="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm">
          Passwort ändern
        </button>
      </div>
    </div>

    <!-- Right column: account info + roles -->
    <div class="space-y-6">

      <!-- Account info -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span class="text-base">👤</span>
          <h3 class="font-semibold text-gray-800 text-sm">Konto</h3>
        </div>
        <div class="px-6 py-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 font-medium uppercase tracking-wide">Kürzel</span>
            <span class="font-mono text-sm text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg">{{ user.kuerzel }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 font-medium uppercase tracking-wide">Vorname</span>
            <span class="text-sm text-gray-800">{{ user.vorname }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 font-medium uppercase tracking-wide">Nachname</span>
            <span class="text-sm text-gray-800">{{ user.name }}</span>
          </div>
        </div>
      </div>

      <!-- Roles -->
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span class="text-base">🪪</span>
          <h3 class="font-semibold text-gray-800 text-sm">Meine Rollen</h3>
        </div>
        <div class="px-6 py-5 flex flex-wrap gap-2">
          <span v-if="isOrgaAdmin" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">🏛 Organisations-Admin</span>
          <span v-if="isZeitstelle" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⏱ Zeitstelle</span>
          <template v-for="(role, cid) in (user.roles || {})" :key="cid">
            <span v-if="role === 'chapteradmin'" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">🏢 Chapter-Admin · {{ i18n.chapter(cid) }}</span>
            <template v-else-if="role?.sparten">
              <span v-for="sp in role.sparten" :key="sp" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">🏓 Spartenadmin · {{ i18n.sparte(sp) }} ({{ i18n.chapter(cid) }})</span>
            </template>
          </template>
          <span v-for="sl in (user.spartenleiter || [])" :key="sl.chapterId + '|' + sl.sparteId"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-700">🏓 Spartenleiter · {{ i18n.sparte(sl.sparteId) }} ({{ i18n.chapter(sl.chapterId) }})</span>
          <span v-if="!isOrgaAdmin && !isZeitstelle && !Object.keys(user.roles || {}).length && !(user.spartenleiter || []).length"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">👤 Mitglied</span>
        </div>
      </div>

    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.UserSettings = UserSettings;
