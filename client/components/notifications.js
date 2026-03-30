/**
 * Notification system — MCM toast framework
 *
 * Usage (in any component that injects 'notify'):
 *   this.notify('Gespeichert!', 'success')
 *   this.notify('Etwas ist schiefgelaufen.', 'error')
 *   this.notify('Bitte Passwort ändern.', 'warn', { persistent: true, action: { label: 'Ändern', fn: () => {} } })
 *
 * Types: 'success' | 'error' | 'warn' | 'info'
 * Options: { duration: ms (default 4000, 0 = no auto-close), persistent: bool, action: { label, fn } }
 *
 * Provides a Vue component <mcm-notifications> that renders the toast stack.
 */

window.MCM_NOTIFY = (() => {
  let _id = 0;
  const { ref } = Vue;
  const toasts = ref([]);

  function notify(message, type = 'info', opts = {}) {
    const id = ++_id;
    const duration = opts.duration !== undefined ? opts.duration : (type === 'error' || opts.persistent ? 0 : 4000);
    const toast = { id, message, type, action: opts.action || null, visible: true };
    toasts.value.push(toast);
    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
    return id;
  }

  function dismiss(id) {
    const t = toasts.value.find(t => t.id === id);
    if (t) t.visible = false;
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 320);
  }

  return { toasts, notify, dismiss };
})();

// ── Component ──
const McmNotifications = {
  name: 'McmNotifications',
  setup() {
    const { toasts, dismiss } = window.MCM_NOTIFY;
    return { toasts, dismiss };
  },
  template: `
<teleport to="body">
  <div class="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none" style="max-width:24rem">
    <transition-group name="toast">
      <div v-for="t in toasts" :key="t.id"
        :class="[
          'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm transition-all duration-300',
          t.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
          t.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300' :
          t.type === 'error'   ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-300' :
          t.type === 'warn'    ? 'bg-amber-50 border-amber-300 text-amber-800 dark:bg-amber-900/30 dark:border-amber-600 dark:text-amber-300' :
                                 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-300'
        ]">
        <!-- Icon -->
        <svg v-if="t.type === 'success'" class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
        <svg v-else-if="t.type === 'error'" class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        <svg v-else-if="t.type === 'warn'" class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        <svg v-else class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <!-- Message -->
        <span class="flex-1 leading-snug">{{ t.message }}</span>
        <!-- Action button -->
        <button v-if="t.action" @click="t.action.fn(); dismiss(t.id)"
          class="ml-1 shrink-0 text-[11px] font-semibold underline opacity-80 hover:opacity-100 whitespace-nowrap">
          {{ t.action.label }}
        </button>
        <!-- Dismiss -->
        <button @click="dismiss(t.id)" class="ml-1 shrink-0 opacity-50 hover:opacity-100 transition-opacity">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </transition-group>
  </div>
</teleport>
  `
};
