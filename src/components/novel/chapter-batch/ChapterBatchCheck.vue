<script setup lang="ts">
/**
 * 多选模式的轻量复选框（章节行 / 卷标题共用），占用与行首状态图标相同的位置。
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
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border-radius: 4px;
  border: 1.5px solid var(--moon-50-opacity-45);
  background: transparent;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.cb-check--on {
  /* 与 PrimeVue 勾选框（主题主色 tsukuyomi-400 + 影墨勾）一致 */
  background: var(--tsukuyomi-400);
  border-color: var(--tsukuyomi-400);
  color: var(--night-500);
}

.cb-check .pi {
  font-size: 8px;
  font-weight: 700;
}
</style>
