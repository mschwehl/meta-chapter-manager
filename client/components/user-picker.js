/**
 * <user-picker> — Reusable multi-select user search component
 *
 * Props:
 *   picker       - reactive object { search, results, list, activeIdx }
 *   nameCache    - reactive object mapping kuerzel → display name
 *   placeholder  - input placeholder text (default: "Kürzel oder Name suchen …")
 *   color        - chip color theme: 'blue' | 'purple' | 'rose' (default: 'blue')
 *   size         - 'sm' | 'md' (default: 'sm') — affects chip/input/dropdown sizing
 *   emptyText    - optional text when list is empty (hidden if falsy)
 *   searchFn     - function(picker) called on input
 *   addFn        - function(picker, user) called when user selected
 *   removeFn     - function(picker, kuerzel) called on chip remove
 *   keydownFn    - function(picker, event) called on keydown
 */
const UserPicker = {
  name: 'UserPicker',
  props: {
    picker:      { type: Object, required: true },
    nameCache:   { type: Object, required: true },
    placeholder: { type: String, default: 'Kürzel oder Name suchen …' },
    color:       { type: String, default: 'blue' },
    size:        { type: String, default: 'sm' },
    emptyText:   { type: String, default: '' },
    searchFn:    { type: Function, required: true },
    addFn:       { type: Function, required: true },
    removeFn:    { type: Function, required: true },
    keydownFn:   { type: Function, required: true },
  },
  computed: {
    chipCls() {
      const map = {
        blue:   'bg-blue-50 text-blue-700',
        purple: 'bg-purple-50 text-purple-700',
        rose:   'bg-rose-50 text-rose-700',
      };
      return map[this.color] || map.blue;
    },
    removeBtnCls() {
      const map = {
        blue:   'text-blue-400 hover:text-blue-700',
        purple: 'text-purple-400 hover:text-purple-700',
        rose:   'text-rose-400 hover:text-rose-700',
      };
      return map[this.color] || map.blue;
    },
    isMd() { return this.size === 'md'; },
    chipSize() { return this.isMd ? 'px-3 py-1 text-sm font-medium' : 'px-2.5 py-0.5 text-xs'; },
    inputCls()  { return this.isMd ? 'ctrl' : 'ctrl text-xs'; },
    dropCls()   { return this.isMd ? 'text-sm' : 'text-xs'; },
    dropMax()   { return 'max-h-48'; },
  },
  template: `
<div>
  <!-- Chips -->
  <div v-if="picker.list.length" :class="isMd ? 'flex flex-wrap gap-2 mb-2' : 'flex flex-wrap gap-1.5 mb-2'">
    <span v-for="k in picker.list" :key="k"
      :class="[chipCls, chipSize]"
      class="inline-flex items-center gap-1 rounded-full">
      <span v-if="nameCache[k]">{{ nameCache[k] }}
        <span class="opacity-60 font-mono" :class="isMd ? 'text-xs' : ''">{{ k }}</span>
      </span>
      <span v-else class="font-mono">{{ k }}</span>
      <button @click="removeFn(picker, k)" :class="removeBtnCls" class="leading-none ml-0.5">&times;</button>
    </span>
  </div>
  <!-- Empty state -->
  <div v-else-if="emptyText" class="text-gray-400 text-xs italic mb-2">{{ emptyText }}</div>
  <!-- Search input + dropdown -->
  <div class="relative">
    <div class="flex gap-1">
      <input v-model="picker.search" @input="searchFn(picker)" @keydown="keydownFn(picker, $event)"
        :placeholder="placeholder" :class="inputCls" autocomplete="off" class="flex-1" />
      <button @click="searchFn(picker)" type="button"
        class="shrink-0 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        title="Suchen">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
      </button>
    </div>
    <div v-if="picker.results.length"
      :class="dropMax"
      class="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden overflow-y-auto">
      <div v-for="(u, idx) in picker.results" :key="u.kuerzel"
        @click="addFn(picker, u)"
        :class="picker.list.includes(u.kuerzel) ? 'pick-disabled' : idx === picker.activeIdx ? 'pick-highlight' : ''"
        class="flex items-center justify-between px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0"
        :style="false">
        <span :class="dropCls">
          <span class="font-semibold">{{ u.vorname }} {{ u.name }}</span>
          <span class="font-mono text-gray-400">({{ u.kuerzel }})</span>
        </span>
        <span class="text-green-600 font-bold">+</span>
      </div>
    </div>
  </div>
</div>
`
};

// Export for Node.js testing or browser global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UserPicker;
} else if (typeof window !== 'undefined') {
  window.UserPicker = UserPicker;
}
