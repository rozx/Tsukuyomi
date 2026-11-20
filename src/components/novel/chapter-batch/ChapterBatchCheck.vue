<script setup lang="ts">
/**
 * 多选模式的轻量复选框（章节行 / 卷标题共用）。
 * 章节行的点击由整行处理，这里只负责显示；卷标题通过 click 事件切换整卷。
 */
import { computed } from 'vue';
import type { VolumeSelectionState } from 'src/composables/book-details/useChapterBatchSelection';

const props = defineProps<{ state: VolumeSelectionState }>();

const icon = computed(() => {
  if (props.state === 'all') return 'pi-check';
  return props.state === 'some' ? 'pi-minus' : '';
});
const ariaChecked = computed(() => {
  if (props.state === 'all') return 'true';
  return props.state === 'some' ? 'mixed' : 'false';
});
</script>

<template>
  <span
    class="cb-check"
    :class="{ 'cb-check--on': state !== 'none' }"
    role="checkbox"
    :aria-checked="ariaChecked"
  >
    <i v-if="icon" class="pi" :class="icon" aria-hidden="true" />
  </span>
</template>

<style scoped>
.cb-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1.5px solid var(--moon-opacity-40);
  background: transparent;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.cb-check--on {
  background: var(--primary-500);
  border-color: var(--primary-500);
  color: var(--night-500);
}

.cb-check .pi {
  font-size: 10px;
  font-weight: 700;
}
</style>
