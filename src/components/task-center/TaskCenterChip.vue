<script setup lang="ts">
/**
 * 顶部系统条上的任务中心入口（桌面 / 平板 / 手机共用）。
 * 外观基类由各系统条传入（chipClass / pillClass），本组件只负责内容与状态。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';

const props = withDefaults(
  defineProps<{
    /** 系统条自身的 chip 样式类 */
    chipClass?: string;
    /** 有活动时追加的 pill 样式类 */
    pillClass?: string;
    /** 手机等窄空间：只保留图标与数字 */
    compact?: boolean;
  }>(),
  { chipClass: '', pillClass: 'pill', compact: false },
);

const { t } = useI18n();
const center = injectTaskCenter();
const chip = center.chip;

const active = computed(() => chip.value.kind !== 'idle');

/** chip 文字；compact 时只保留数字（运行数 / 排队数） */
const labelFor = (compact: boolean): string => {
  const state = chip.value;
  switch (state.kind) {
    case 'running':
      return compact
        ? String(state.running)
        : t('taskQueueUi.chipRunning', { running: state.running });
    case 'running-queued':
      return compact
        ? `${state.running} · ${state.queued}`
        : t('taskQueueUi.chipRunningQueued', { running: state.running, queued: state.queued });
    case 'paused':
      return compact ? String(state.queued) : t('taskQueueUi.chipPaused', { queued: state.queued });
    case 'other':
      return compact ? '' : t('taskQueueUi.chipOther');
    case 'finished':
      return t('taskQueueUi.chipDone', { done: state.done });
    default:
      return compact ? '' : t('taskQueueUi.chipIdle');
  }
};

const label = computed(() => labelFor(props.compact));
// 非 compact 时也备一份只含数字的文字：系统条变窄时由外层容器查询切换显示
const narrowLabel = computed(() => (props.compact ? '' : labelFor(true)));

const icon = computed(() => {
  switch (chip.value.kind) {
    case 'running':
    case 'running-queued':
      return 'pi pi-spin pi-spinner';
    case 'paused':
      return 'pi pi-pause';
    case 'finished':
      return 'pi pi-check';
    case 'other':
      return '';
    default:
      return 'pi pi-list-check';
  }
});

const showBar = computed(
  () => chip.value.kind === 'running' || chip.value.kind === 'running-queued',
);
const failed = computed(() => (chip.value.kind === 'finished' ? chip.value.failed : 0));
</script>

<template>
  <button
    type="button"
    class="tc-chip"
    :class="[
      chipClass,
      active ? pillClass : '',
      `tc-chip--${chip.kind}`,
      { 'tc-chip--flash': center.flash.value },
    ]"
    :aria-label="t('taskQueueUi.title')"
    aria-haspopup="dialog"
    data-testid="task-center-chip"
    @click="center.toggle($event)"
  >
    <span v-if="chip.kind === 'other'" class="tc-dot" aria-hidden="true" />
    <i v-else :class="icon" aria-hidden="true" />
    <span v-if="label" class="tc-label" :class="{ 'tc-label--wide': !compact }">{{ label }}</span>
    <span v-if="narrowLabel" class="tc-label tc-label--narrow">{{ narrowLabel }}</span>
    <span v-if="failed > 0" class="tc-failed">{{ t('taskQueueUi.chipFailed', { failed }) }}</span>
    <span v-if="showBar" class="tc-bar" aria-hidden="true">
      <span class="tc-bar-done" :style="{ width: `${center.overall.value.donePercent}%` }" />
      <span class="tc-bar-running" :style="{ width: `${center.overall.value.runningPercent}%` }" />
    </span>
    <span v-if="showBar && !compact" class="tc-count">
      {{ center.overall.value.done }}/{{ center.overall.value.total }}
    </span>
  </button>
</template>

<style scoped>
.tc-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.tc-chip i {
  font-size: 12px;
}

.tc-label {
  font-size: 11px;
}

/* 窄系统条用的数字版文字，默认隐藏；由系统条的容器查询与 .tc-label--wide 互换 */
.tc-label--narrow {
  display: none;
}

.tc-failed {
  font-size: 11px;
  color: #f0a3a3;
}

.tc-count {
  font-size: 10px;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

.tc-bar {
  display: inline-flex;
  width: 44px;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  background: var(--white-opacity-10);
}

.tc-bar-done {
  background: #7fc29b;
  transition: width 300ms ease;
}

.tc-bar-running {
  background: #a3b7cf;
  transition: width 300ms ease;
}

.tc-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a3b7cf;
  box-shadow: 0 0 8px #a3b7cf;
  animation: tc-pulse 1.6s ease-in-out infinite;
}

.tc-chip--finished {
  color: #a8d8b9;
}

.tc-chip--flash {
  animation: tc-flash 1.2s ease-out;
}

@keyframes tc-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

@keyframes tc-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(163, 183, 207, 0.6);
  }
  100% {
    box-shadow: 0 0 0 8px rgba(163, 183, 207, 0);
  }
}
</style>
