<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTranslationProgressPanel } from 'src/composables/translation-progress/useTranslationProgressPanel';
import TaskEmptyState from './translation-progress/TaskEmptyState.vue';
import MobileProgressBody from './translation-progress/MobileProgressBody.vue';

const {
  currentTask,
  currentParts,
  currentTaskTodos,
  currentAutoScroll,
  toggleAutoScroll,
  toggleTodoCollapsed,
  formatDuration,
  stopTask,
  clearCompletedTasks,
  mobileProgress,
  mobileEta,
  mobileWorkflowLabel,
  mobileStatTotals,
  mobileIsRunning,
  mobileLegend,
} = useTranslationProgressPanel();

// 手机端分段 tab（实时/待办/统计/日志）— 纯视图局部状态
const mobileTab = ref<'live' | 'todo' | 'stats' | 'log'>('live');
// 分段按钮配置：把四个近乎相同的按钮收敛为 v-for，降低模板圈复杂度
const mobileTabs = computed(() => [
  { key: 'live' as const, label: '实时' },
  { key: 'todo' as const, label: '待办' },
  { key: 'stats' as const, label: '统计' },
  { key: 'log' as const, label: '日志' },
]);
</script>

<template>
  <div class="translation-progress mtp">
    <!-- Header moved to MobileProgressSheet's #header slot (icon + 标题 + 副标题 + X);
         不再在这里渲染，避免与 sheet 自己的 header 重复 -->

    <template v-if="currentTask">
      <!-- Hero meter -->
      <div class="mtp-hero">
        <div class="mtp-hero-row">
          <div>
            <div class="mtp-hero-num">
              {{ mobileProgress.current
              }}<span class="mtp-hero-den"> / {{ mobileProgress.total }}</span>
            </div>
            <div class="mtp-hero-label">段落已完成</div>
          </div>
          <div class="mtp-hero-right">
            <div class="mtp-hero-eta">{{ mobileEta }}</div>
            <div class="mtp-hero-label">预计剩余</div>
          </div>
        </div>
        <div class="mtp-bar">
          <div class="mtp-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
          <div
            v-if="mobileIsRunning"
            class="mtp-bar-shimmer"
            :style="{ left: `${mobileProgress.percent}%` }"
          />
        </div>
        <div class="mtp-legend">
          <span v-for="item in mobileLegend" :key="item.label">
            <span class="mtp-legend-dot" :style="{ color: item.color }">●</span>
            {{ item.label }} {{ item.value }}
          </span>
        </div>
      </div>

      <!-- Segmented tabs -->
      <div class="mtp-seg-wrap">
        <div class="mtp-seg">
          <button
            v-for="tab in mobileTabs"
            :key="tab.key"
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === tab.key }"
            @click="mobileTab = tab.key"
          >
            {{ tab.label
            }}<span
              v-if="tab.key === 'todo' && currentTaskTodos.length > 0"
              class="mtp-seg-count"
              >{{ currentTaskTodos.length }}</span
            >
          </button>
        </div>
      </div>

      <!-- Body -->
      <MobileProgressBody
        :mobile-tab="mobileTab"
        :current-task="currentTask"
        :current-parts="currentParts"
        :current-auto-scroll="currentAutoScroll"
        :mobile-progress="mobileProgress"
        :mobile-is-running="mobileIsRunning"
        :mobile-workflow-label="mobileWorkflowLabel"
        :mobile-stat-totals="mobileStatTotals"
        :current-task-todos="currentTaskTodos"
        :format-duration="formatDuration"
        @toggle-auto-scroll="toggleAutoScroll"
        @toggle-todo-collapsed="toggleTodoCollapsed"
      />

      <!-- Bottom actions -->
      <div class="mtp-actions">
        <div class="mtp-actions-spacer" />
        <button
          v-if="mobileIsRunning"
          class="mtp-btn mtp-btn-outline mtp-btn-danger"
          @click="stopTask"
        >
          <i class="pi pi-stop-circle" aria-hidden="true" />停止
        </button>
        <button v-else class="mtp-btn mtp-btn-outline" @click="clearCompletedTasks">
          <i class="pi pi-trash" aria-hidden="true" />清除已完成
        </button>
      </div>
    </template>

    <TaskEmptyState v-else />
  </div>
</template>

<style scoped>
/* Shared shell (also in Desktop variant — kept here because scoped styles don't cross
   component boundaries and the root class is bound to this file's outer element) */
.translation-progress {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.translation-progress :deep(p),
.translation-progress :deep(.todo-text),
.translation-progress :deep(.stream-text),
.translation-progress :deep(.tool-result),
.translation-progress :deep(.thinking-content) {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* ───────────────── Mobile translation progress (matches design) ───────────────── */
.mtp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.mtp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.mtp-head-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--tsukuyomi-opacity-18);
  border: 1px solid var(--tsukuyomi-opacity-30);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mtp-head-icon i {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-size: 14px;
}

.mtp-head-text {
  flex: 1;
  min-width: 0;
}

.mtp-head-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.mtp-head-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtp-head-close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--moon-50-opacity-75);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-head-close:hover {
  background: var(--white-opacity-5);
  color: var(--moon-50-opacity-100);
}

.mtp-head-close i {
  font-size: 12px;
}

/* Hero meter */
.mtp-hero {
  padding: 16px 20px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--white-opacity-6);
}

.mtp-hero-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.mtp-hero-num {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 30px;
  font-weight: 700;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.02em;
  line-height: 1;
}

.mtp-hero-den {
  color: var(--moon-50-opacity-55);
  font-weight: 400;
}

.mtp-hero-label {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.mtp-hero-right {
  text-align: right;
}

.mtp-hero-eta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-weight: 500;
}

.mtp-bar {
  height: 6px;
  background: var(--white-opacity-6);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.mtp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--tsukuyomi-500), var(--primary-300)); /* tokens: tsukuyomi-500 → primary-300 */
  border-radius: 3px;
  box-shadow: 0 0 12px var(--tsukuyomi-opacity-50); /* token: tsukuyomi-500 @ 50% */
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-bar-shimmer {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: var(--white-opacity-90); /* token: white @ 90% */
  box-shadow: 0 0 8px var(--white-opacity-80); /* token: white @ 80% */
  transition: left 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  flex-wrap: wrap;
}

.mtp-legend-dot {
  margin-right: 2px;
}

/* Segmented tabs */
.mtp-seg-wrap {
  padding: 12px 16px 0;
  flex-shrink: 0;
}

.mtp-seg {
  display: flex;
  padding: 3px;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 9px;
  gap: 2px;
}

.mtp-seg-btn {
  flex: 1;
  padding: 7px 10px;
  text-align: center;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  color: var(--moon-50-opacity-70); /* token: moon-50 @ 70% */
  border-radius: 7px;
  cursor: pointer;
  border: none;
  background: transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-seg-btn-active {
  background: var(--tsukuyomi-opacity-20);
  color: var(--primary-200); /* token: primary-200 */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.mtp-seg-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  opacity: 0.7;
}

/* body 区样式（.mtp-body / .mtp-section-label / .mtp-empty / .mtp-live-* / .mtp-model-* /
 * .mtp-total* / .mtp-todo* / .mtp-stream-wrap* / .mtp-log-stack 及相关 :deep）已迁出至
 * translation-progress/MobileProgressBody.vue —— 这些元素渲染于该子组件，scoped 样式留在父级
 * 无法穿透到子组件内部嵌套元素，故移到消费它们的组件作用域。 */

/* Bottom actions */
.mtp-actions {
  padding: 10px 12px 12px;
  border-top: 1px solid var(--white-opacity-6);
  background: var(--night-500-opacity-72); /* token: night-500 @ 72% */
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.mtp-actions-spacer {
  flex: 1;
}

.mtp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.mtp-btn i {
  font-size: 10px;
}

.mtp-btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.mtp-btn-outline {
  background: var(--white-opacity-3);
  color: var(--moon-50-opacity-85);
  border-color: var(--white-opacity-10);
}

.mtp-btn-outline:hover:not(:disabled) {
  background: var(--white-opacity-6);
}

.mtp-btn-danger {
  color: var(--color-danger); /* token: danger-500 */
  border-color: var(--color-danger-opacity-30); /* token: danger @ 30% */
}
</style>
