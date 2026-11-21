<script setup lang="ts">
/** 固定面板收起后的迷你进度条：运行中任务摘要 + 整体进度，点击恢复面板 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';

const emit = defineEmits<{ expand: []; dragStart: [event: PointerEvent] }>();
const { t } = useI18n();
const center = injectTaskCenter();

const summary = computed(() => {
  const running = center.groups.value.running;
  if (running.length === 0) {
    return center.chip.value.kind === 'idle' ? t('taskQueueUi.empty') : t('taskQueueUi.title');
  }
  if (running.length > 2) return t('taskQueueUi.miniRunning', { count: running.length });
  return running.map((row) => `${row.chapterTitle} ${row.progress.percent}%`).join(' · ');
});
</script>

<template>
  <div class="tc-mini" @pointerdown="emit('dragStart', $event)">
    <button
      type="button"
      class="tc-mini-main"
      :aria-label="t('taskQueueUi.expand')"
      @click="emit('expand')"
    >
      <i
        :class="center.groups.value.running.length ? 'pi pi-spin pi-spinner' : 'pi pi-list-check'"
        aria-hidden="true"
      />
      <span class="tc-mini-text">{{ summary }}</span>
      <i class="pi pi-chevron-up" aria-hidden="true" />
    </button>
    <div class="tc-mini-bar" aria-hidden="true">
      <span class="tc-mini-done" :style="{ width: `${center.overall.value.donePercent}%` }" />
      <span class="tc-mini-running" :style="{ width: `${center.overall.value.runningPercent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.tc-mini {
  cursor: move;
  user-select: none;
}

.tc-mini-main {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: none;
  border: none;
  color: var(--moon-opacity-90);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.tc-mini-main i {
  font-size: 11px;
  color: #a3b7cf;
}

.tc-mini-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-mini-bar {
  display: flex;
  height: 3px;
  background: var(--white-opacity-8);
}

.tc-mini-done {
  background: #7fc29b;
  transition: width 300ms ease;
}

.tc-mini-running {
  background: #a3b7cf;
  transition: width 300ms ease;
}
</style>
