/**
 * <status-badge> — Inline active/inactive status pill
 *
 * Props:
 *   active - Boolean: true → green "aktiv", false → gray "inaktiv"/"passiv"
 *   label  - optional override text (defaults to "aktiv"/"inaktiv")
 */
const StatusBadge = {
  name: 'StatusBadge',
  props: {
    active: { type: Boolean, required: true },
    label:  { type: String, default: '' },
  },
  computed: {
    text() { return this.label || (this.active ? 'aktiv' : 'inaktiv'); },
  },
  template: `
<span :class="active ? 'val-active' : 'val-inactive'"
  class="px-2 py-0.5 rounded-full text-[10px] font-semibold">{{ text }}</span>
`
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = StatusBadge;
} else if (typeof window !== 'undefined') {
  window.StatusBadge = StatusBadge;
}
