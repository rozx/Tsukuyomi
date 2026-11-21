<script setup lang="ts">
/**
 * 设置项状态行（已配置 / 未配置 / 错误等）：统一图标与配色。
 */
import { computed } from 'vue';

interface Props {
  tone: 'success' | 'warn' | 'error' | 'muted';
}

const props = defineProps<Props>();

const ICONS: Record<Props['tone'], string> = {
  success: 'pi pi-check-circle',
  warn: 'pi pi-exclamation-triangle',
  error: 'pi pi-times-circle',
  muted: 'pi pi-info-circle',
};

const icon = computed(() => ICONS[props.tone]);
</script>

<template>
  <p class="settings-status" :class="`settings-status--${tone}`">
    <i :class="icon" class="settings-status-icon" aria-hidden="true" />
    <span><slot /></span>
  </p>
</template>

<style scoped>
.settings-status {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.55;
}

.settings-status-icon {
  margin-top: 0.18rem;
  font-size: 0.75rem;
  flex-shrink: 0;
}

.settings-status--success {
  color: var(--color-success-300);
}

.settings-status--warn {
  color: var(--color-warning);
}

.settings-status--error {
  color: var(--color-danger-300);
}

.settings-status--muted {
  color: var(--moon-50-opacity-58);
}
</style>
