<script setup lang="ts">
import { useDesktopUpdateBadge } from 'src/composables/useDesktopUpdates';

const { badge, activate } = useDesktopUpdateBadge();
</script>

<template>
  <template v-if="badge">
    <button
      v-if="badge.clickable"
      type="button"
      class="dsk-statusbar-update is-update"
      :title="badge.title"
      :aria-label="badge.title"
      @click="activate"
    >
      <i class="pi pi-arrow-circle-up" aria-hidden="true" />
      <span>{{ badge.label }}</span>
    </button>
    <span
      v-else
      class="dsk-statusbar-update"
      :class="`is-${badge.tone}`"
      :title="badge.title"
      role="status"
    >
      <i v-if="badge.tone === 'latest'" class="pi pi-check" aria-hidden="true" />
      <i v-else class="pi pi-spin pi-spinner" aria-hidden="true" />
      <span>{{ badge.label }}</span>
    </span>
  </template>
</template>

<style scoped>
.dsk-statusbar-update {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 14px;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.dsk-statusbar-update i {
  font-size: 8px;
  line-height: 1;
}

.is-latest {
  color: rgba(167, 209, 176, 0.75);
  background: rgba(167, 209, 176, 0.08);
  border-color: rgba(167, 209, 176, 0.22);
}

.is-busy {
  color: rgba(163, 183, 207, 0.6);
  background: rgba(109, 136, 168, 0.06);
  border-color: rgba(109, 136, 168, 0.16);
}

.is-update {
  cursor: pointer;
  color: rgba(214, 226, 240, 0.95);
  background: rgba(163, 183, 207, 0.16);
  border-color: rgba(163, 183, 207, 0.42);
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.is-update:hover {
  background: rgba(163, 183, 207, 0.26);
  border-color: rgba(163, 183, 207, 0.65);
}

.is-update:focus-visible {
  outline: 1px solid rgba(163, 183, 207, 0.85);
  outline-offset: 1px;
}
</style>
