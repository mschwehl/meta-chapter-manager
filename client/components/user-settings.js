/**
 * <user-settings> — Password change + account info + role badges
 *
 * Inject: apiPost, i18n, user, isOrgaAdmin, isZeitstelle, darkMode, toggleDark
 */
const UserSettings = {
  name: 'UserSettings',
  inject: ['apiPost', 'i18n', 'user', 'isOrgaAdmin', 'isZeitstelle', 'darkMode', 'toggleDark'],
  emits: ['passwordChanged', 'back'],
  data() {
    return {
      pwForm: { current: '', next: '', confirm: '' },
      pwLoading: false,
      pwError: '',
      pwSuccess: false,
    };
  },
  computed: {
    pwValid() {
      return this.pwForm.current && this.pwForm.next.length >= 6 && this.pwForm.next === this.pwForm.confirm;
    },
    pwMismatch() {
      return this.pwForm.confirm && this.pwForm.next !== this.pwForm.confirm;
    },
  },
  methods: {
    async changePassword() {
      if (!this.pwValid) return;
      this.pwLoading = true;
      this.pwError = '';
      this.pwSuccess = false;
      try {
        const r = await this.apiPost('/api/auth/change-password', {
          currentPassword: this.pwForm.current,
          newPassword: this.pwForm.next,
        });
        if (!r.ok) {
          const d = await r.json();
          this.pwError = d.error || 'Fehler beim Ändern des Passworts';
          return;
        }
        this.pwSuccess = true;
        this.pwForm = { current: '', next: '', confirm: '' };
        setTimeout(() => { this.pwSuccess = false; this.$emit('passwordChanged'); }, 2000);
      } catch (e) {
        this.pwError = e.message;
      } finally {
        this.pwLoading = false;
      }
    },
  },
  template: `
<div class="p-6 max-w-5xl mx-auto">
  <div class="flex items-center gap-3 mb-6">
    <button @click="$emit('back')" class="btn-back"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>Zurück</button>
    <h1 class="text-xl font-bold text-gray-800 dark:text-gray-100">Einstellungen</h1>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

    <!-- Left column: password change form + dark mode -->
    <div class="space-y-4">

      <div class="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2d3148] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
          <span class="text-base">🔑</span>
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 text-sm">Passwort ändern</h3>
        </div>
        <div class="px-6 py-5 space-y-3">
          <div v-if="pwSuccess" class="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Passwort erfolgreich geändert.
          </div>
          <div v-if="pwError" class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">{{ pwError }}</div>
          <div>
            <label class="lbl">Aktuelles Passwort</label>
            <input v-model="pwForm.current" type="password" class="ctrl" autocomplete="current-password" />
          </div>
          <div>
            <label class="lbl">Neues Passwort <span class="text-gray-400 font-normal">(min. 6 Zeichen)</span></label>
            <input v-model="pwForm.next" type="password" class="ctrl" autocomplete="new-password" />
          </div>
          <div>
            <label class="lbl">Neues Passwort bestätigen</label>
            <input v-model="pwForm.confirm" type="password" class="ctrl" :class="pwMismatch ? 'border-red-400 ring-1 ring-red-400' : ''" autocomplete="new-password" />
            <p v-if="pwMismatch" class="mt-1 text-[10px] text-red-500">⚠ Passwörter stimmen nicht überein</p>
          </div>
          <button @click="changePassword" :disabled="!pwValid || pwLoading"
            class="btn-sm w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed">
            {{ pwLoading ? 'Speichern…' : 'Passwort ändern' }}
          </button>
        </div>
      </div>

      <!-- Appearance -->
      <div class="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2d3148] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
          <span class="text-base">🌙</span>
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 text-sm">Darstellung</h3>
        </div>
        <div class="px-6 py-5 flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-gray-700 dark:text-gray-200">Dark Mode</div>
            <div class="text-xs text-gray-400 mt-0.5">Dunkles Farbschema aktivieren</div>
          </div>
          <button @click="toggleDark()"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            :class="darkMode ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'">
            <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform"
              :class="darkMode ? 'translate-x-6' : 'translate-x-1'"></span>
          </button>
        </div>
      </div>

    </div>

    <!-- Right column: account info + roles -->
    <div class="space-y-6">

      <!-- Account info -->
      <div class="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2d3148] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
          <span class="text-base">👤</span>
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 text-sm">Konto</h3>
        </div>
        <div class="px-6 py-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Kürzel</span>
            <span class="font-mono text-sm text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-[#1e2130] px-2.5 py-1 rounded-lg">{{ user.kuerzel }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Vorname</span>
            <span class="text-sm text-gray-800 dark:text-gray-200">{{ user.vorname }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">Nachname</span>
            <span class="text-sm text-gray-800 dark:text-gray-200">{{ user.name }}</span>
          </div>
        </div>
      </div>

      <!-- Roles -->
      <div class="bg-white dark:bg-[#1a1d27] rounded-2xl shadow-sm border border-gray-100 dark:border-[#2d3148] overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-100 dark:border-[#2d3148] flex items-center gap-2">
          <span class="text-base">🪪</span>
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 text-sm">Meine Rollen</h3>
        </div>
        <div class="px-6 py-5 flex flex-wrap gap-2">
          <span v-if="isOrgaAdmin" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">🏛 Organisations-Admin</span>
          <span v-if="isZeitstelle" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">⏱ Zeitstelle</span>
          <template v-for="(role, cid) in (user.roles || {})" :key="cid">
            <span v-if="role.level === ROLE_LEVEL.CHAPTER" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">🏢 Chapter-Admin · {{ i18n.chapter(cid) }}</span>
            <span v-for="sp in (role.sparten || [])" :key="cid + '|' + sp"
              :class="role.level === ROLE_LEVEL.CHAPTER ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold">
              🏓 Spartenadmin · {{ i18n.sparte(sp) }} ({{ i18n.chapter(cid) }})</span>
          </template>
          <span v-if="!isOrgaAdmin && !isZeitstelle && !Object.keys(user.roles || {}).length"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-[#1e2130] text-gray-500 dark:text-gray-400">👤 Mitglied</span>
        </div>
      </div>

    </div>
  </div>
</div>
`
};

if (typeof window !== 'undefined') window.UserSettings = UserSettings;
