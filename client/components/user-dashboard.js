/**
 * <user-dashboard> — Personal dashboard for every user
 *
 * Shows: greeting, chapter memberships, personal roles, account info.
 * Inject: api, i18n, user, isOrgaAdmin, isZeitstelle, chapterDirectory
 */
const UserDashboard = {
  name: 'UserDashboard',
  inject: ['api', 'i18n', 'user', 'isOrgaAdmin', 'isZeitstelle', 'chapterDirectory'],
  emits: ['navigate'],
  data() {
    return {
      profile: null,
      loading: true,
    };
  },
  computed: {
    activeChapters() {
      if (!this.profile || !this.profile.chapters) return [];
      const today = new Date().toISOString().slice(0, 10);
      return this.profile.chapters.filter(ch => {
        if (!ch.eintrittsdatum || ch.eintrittsdatum > today) return false;
        if (ch.austrittsdatum && ch.austrittsdatum < today) return false;
        return true;
      });
    },
    inactiveChapters() {
      if (!this.profile || !this.profile.chapters) return [];
      const today = new Date().toISOString().slice(0, 10);
      return this.profile.chapters.filter(ch => {
        if (!ch.eintrittsdatum || ch.eintrittsdatum > today) return true;
        if (ch.austrittsdatum && ch.austrittsdatum < today) return true;
        return false;
      });
    },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const r = await this.api(`/api/users/${encodeURIComponent(this.user.kuerzel)}`);
        if (r.ok) this.profile = await r.json();
      } catch {}
      this.loading = false;
    },
  },
  mounted() { this.load(); },
  template: `
<div class="p-6 max-w-4xl mx-auto space-y-6">

  <!-- Greeting -->
  <div>
    <h1 class="text-2xl font-bold text-gray-800">Mein Bereich</h1>
    <p class="text-gray-500 mt-1 text-sm">Willkommen, {{ user.vorname }} {{ user.name }}</p>
  </div>

  <!-- Loading -->
  <div v-if="loading" class="text-center py-12 text-gray-400 text-sm">Laden…</div>

  <template v-else>

    <!-- Account info card -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <span class="text-base">👤</span>
        <h3 class="font-semibold text-gray-800 text-sm">Konto</h3>
      </div>
      <div class="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Kürzel</div>
          <div class="font-mono text-sm text-gray-800 bg-gray-100 px-2.5 py-1 rounded-lg inline-block">{{ user.kuerzel }}</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Vorname</div>
          <div class="text-sm text-gray-800">{{ user.vorname }}</div>
        </div>
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Nachname</div>
          <div class="text-sm text-gray-800">{{ user.name }}</div>
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
          <span v-if="role.level === ROLE_LEVEL.CHAPTER" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">🏢 Chapter-Admin · {{ i18n.chapter(cid) }}</span>
          <span v-for="sp in (role.sparten || [])" :key="cid + '|' + sp"
            :class="role.level === ROLE_LEVEL.CHAPTER ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold">
            🏓 {{ role.level === ROLE_LEVEL.CHAPTER ? 'Spartenleiter' : 'Spartenadmin' }} · {{ i18n.sparte(sp) }} ({{ i18n.chapter(cid) }})
          </span>
        </template>
        <span v-if="!isOrgaAdmin && !isZeitstelle && !Object.keys(user.roles || {}).length"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">👤 Mitglied</span>
      </div>
    </div>

    <!-- Active memberships -->
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <span class="text-base">🏅</span>
        <h3 class="font-semibold text-gray-800 text-sm">Meine Mitgliedschaften</h3>
      </div>
      <div v-if="activeChapters.length === 0 && inactiveChapters.length === 0" class="px-6 py-8 text-center text-gray-400 text-sm">
        Noch keine Mitgliedschaften vorhanden.
      </div>
      <div v-else class="divide-y divide-gray-100">
        <div v-for="ch in activeChapters" :key="ch.chapterId + ch.sparte" class="px-6 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-green-400 shrink-0"></span>
            <div>
              <div class="text-sm font-medium text-gray-800">{{ i18n.chapter(ch.chapterId) }}</div>
              <div class="text-xs text-gray-500">{{ i18n.sparte(ch.sparte) }}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-500">seit {{ ch.eintrittsdatum }}</div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">Aktiv</span>
          </div>
        </div>
        <div v-for="ch in inactiveChapters" :key="'i-' + ch.chapterId + ch.sparte" class="px-6 py-4 flex items-center justify-between opacity-60">
          <div class="flex items-center gap-3">
            <span class="w-2 h-2 rounded-full bg-gray-300 shrink-0"></span>
            <div>
              <div class="text-sm font-medium text-gray-800">{{ i18n.chapter(ch.chapterId) }}</div>
              <div class="text-xs text-gray-500">{{ i18n.sparte(ch.sparte) }}</div>
            </div>
          </div>
          <div class="text-right">
            <div v-if="ch.austrittsdatum" class="text-xs text-gray-400">bis {{ ch.austrittsdatum }}</div>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Inaktiv</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick actions -->
    <div class="flex gap-3">
      <button @click="$emit('navigate', 'settings')"
        class="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 hover:shadow-sm transition-all">
        🔑 Passwort ändern
      </button>
    </div>

    <!-- Chapter directory -->
    <div v-if="chapterDirectory && chapterDirectory.length">
      <h2 class="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Verfügbare Chapter</h2>
      <div class="space-y-3">
        <div v-for="ch in chapterDirectory" :key="ch.id"
          class="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <div class="font-semibold text-gray-800 text-sm">{{ ch.name || ch.id }}</div>
              <div v-if="ch.gegruendet" class="text-[11px] text-gray-400 mt-0.5">Gegründet {{ ch.gegruendet }}</div>
            </div>
            <div v-if="ch.admins && ch.admins.length" class="flex flex-wrap gap-1 justify-end">
              <span v-for="a in ch.admins" :key="a.kuerzel"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-600">
                👤 {{ a.displayName }}
              </span>
            </div>
          </div>
          <div v-if="ch.sparten && ch.sparten.length" class="flex flex-wrap gap-1.5 mt-3">
            <span v-for="sp in ch.sparten" :key="sp.id"
              class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-100 text-gray-600">
              {{ sp.name || sp.id }}
            </span>
          </div>
          <div v-else class="text-gray-300 text-[11px] mt-2">Noch keine Sparten angelegt</div>
        </div>
      </div>
    </div>

  </template>
</div>
`
};

if (typeof window !== 'undefined') window.UserDashboard = UserDashboard;
