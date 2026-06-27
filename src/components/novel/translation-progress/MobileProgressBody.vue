<script setup lang="ts">
import { computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import type { TodoItem } from 'src/services/todo-list-service';
import TaskTodos from './TaskTodos.vue';
import TaskStream from './TaskStream.vue';

// 手机端分段 tab 内容（实时/统计/待办/日志）：把四路 v-if 分派与各 tab 内部嵌套
// 收敛到单一叶子组件，降低 TranslationProgressMobile 模板圈复杂度。
const props = defineProps<{
  mobileTab: 'live' | 'todo' | 'stats' | 'log';
  currentTask: AIProcessingTask;
  currentParts: FormattedMessagePart[];
  currentAutoScroll: boolean;
  mobileProgress: { current: number; total: number; percent: number };
  mobileIsRunning: boolean;
  mobileWorkflowLabel: string;
  mobileStatTotals: Array<{ label: string; value: string; icon: string }>;
  currentTaskTodos: TodoItem[];
  formatDuration: (startTime: number, endTime?: number) => string;
}>();

defineEmits<{
  toggleAutoScroll: [];
  toggleTodoCollapsed: [];
}>();

const spinnerIcon = computed(() =>
  props.mobileIsRunning ? 'pi-spin pi-spinner' : 'pi-check-circle',
);
const liveStatus = computed(() => (props.mobileIsRunning ? '正在翻译' : '已停止'));
const progressMessage = computed(() => props.currentTask.progress?.message);
const thinkingTail = computed(() => props.currentTask.thinkingMessage?.split('\n').slice(-1)[0]);
const contextText = computed(() =>
  props.currentTask.contextPercentage !== undefined ? `${props.currentTask.contextPercentage}%` : '—',
);
</script>

<template>
  <div class="mtp-body">
    <!-- 实时 -->
    <template v-if="mobileTab === 'live'">
      <div class="mtp-live-card">
        <div class="mtp-live-head">
          <i class="pi mtp-live-spinner" :class="spinnerIcon" aria-hidden="true" />
          <span class="mtp-live-eyebrow">
            {{ liveStatus }} · § {{ String(mobileProgress.current).padStart(3, '0') }}
          </span>
          <span class="mtp-live-model">
            <i class="pi pi-sparkles" aria-hidden="true" />
            {{ currentTask.modelName }}
          </span>
        </div>
        <div v-if="progressMessage" class="mtp-live-text">{{ progressMessage }}</div>
        <div v-else-if="thinkingTail" class="mtp-live-text">{{ thinkingTail }}</div>
        <div class="mtp-live-bar">
          <div class="mtp-live-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
        </div>
        <div class="mtp-live-meta">
          <span>上下文 {{ contextText }}</span>
          <span>{{ formatDuration(currentTask.startTime, currentTask.endTime) }}</span>
        </div>
      </div>

      <div class="mtp-section-label">活动记录</div>
      <div class="mtp-stream-wrap mtp-stream-wrap--compact">
        <TaskStream
          :task="currentTask"
          :parts="currentParts"
          :auto-scroll="currentAutoScroll"
          @toggle-auto-scroll="$emit('toggleAutoScroll')"
        />
      </div>
    </template>

    <!-- 统计 -->
    <template v-else-if="mobileTab === 'stats'">
      <div class="mtp-section-label">模型使用</div>
      <div class="mtp-model-card">
        <div class="mtp-model-head">
          <span class="mtp-model-dot" />
          <span class="mtp-model-name">{{ currentTask.modelName }}</span>
          <span class="mtp-model-count">{{ mobileProgress.current }} 次调用</span>
        </div>
        <div class="mtp-model-bar">
          <div class="mtp-model-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
        </div>
        <div class="mtp-model-meta">
          <span>进度 {{ mobileProgress.percent }}%</span>
          <span>{{ mobileWorkflowLabel }}</span>
        </div>
      </div>

      <div class="mtp-section-label">本次批量</div>
      <div class="mtp-totals">
        <div v-for="t in mobileStatTotals" :key="t.label" class="mtp-total">
          <div class="mtp-total-head">
            <span class="mtp-total-label">{{ t.label }}</span>
            <i :class="['pi', t.icon, 'mtp-total-icon']" aria-hidden="true" />
          </div>
          <div class="mtp-total-value">{{ t.value }}</div>
        </div>
      </div>
    </template>

    <!-- 待办 -->
    <template v-else-if="mobileTab === 'todo'">
      <div class="mtp-todo-panel">
        <div v-if="currentTaskTodos.length > 0" class="mtp-todos-wrap mtp-todos-wrap--full">
          <TaskTodos :todos="currentTaskTodos" :collapsed="false" @toggle-collapsed="$emit('toggleTodoCollapsed')" />
        </div>
        <div v-else class="mtp-empty">暂无待办事项</div>
      </div>
    </template>

    <!-- 日志（占满剩余空间，内部滚动） -->
    <template v-else-if="mobileTab === 'log'">
      <div class="mtp-log-stack">
        <div class="mtp-stream-wrap mtp-stream-wrap--fill">
          <TaskStream
            :task="currentTask"
            :parts="currentParts"
            :auto-scroll="currentAutoScroll"
            @toggle-auto-scroll="$emit('toggleAutoScroll')"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 手机端翻译进度面板的 body 区样式。
 * 注：这些规则从 TranslationProgressMobile.vue 迁移而来 —— 该父组件把 body 抽成本组件后，
 * 其 scoped 样式无法穿透到子组件内部嵌套元素（仅子组件根元素继承父级 scope），
 * 导致 .mtp-body / .mtp-live-* / .mtp-model-* 等丢失布局。样式应与其消费的模板同处一个组件作用域。 */

/* Body */
.mtp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 0 14px;
  display: flex;
  flex-direction: column;
}

.mtp-body::-webkit-scrollbar {
  width: 0;
}

.mtp-section-label {
  padding: 8px 20px 6px;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 500;
}

.mtp-empty {
  padding: 28px 20px;
  text-align: center;
  color: var(--moon-50-opacity-45);
  font-size: 12px;
}

/* Live card */
.mtp-live-card {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: var(--tsukuyomi-opacity-10);
  border: 1px solid var(--tsukuyomi-opacity-30);
  border-radius: 12px;
  box-shadow: 0 2px 8px var(--tsukuyomi-opacity-25);
}

.mtp-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mtp-live-spinner {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-size: 12px;
}

.mtp-live-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 500;
}

.mtp-live-model {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  background: var(--tsukuyomi-opacity-15);
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
  border: 1px solid var(--tsukuyomi-opacity-30);
}

.mtp-live-model i {
  font-size: 9px;
}

.mtp-live-text {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 12px;
  color: var(--moon-50-opacity-85);
  line-height: 1.65;
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 72px;
  overflow: hidden;
}

.mtp-live-bar {
  height: 3px;
  background: var(--white-opacity-6);
  border-radius: 2px;
  overflow: hidden;
}

.mtp-live-bar-fill {
  height: 100%;
  background: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-live-meta {
  display: flex;
  justify-content: space-between;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: var(--moon-50-opacity-55);
  margin-top: 6px;
}

/* Stats */
.mtp-model-card {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
  border-radius: 10px;
}

.mtp-model-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mtp-model-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  flex-shrink: 0;
}

.mtp-model-name {
  font-size: 13px;
  color: var(--moon-50-opacity-100);
  font-weight: 500;
}

.mtp-model-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-left: auto;
}

.mtp-model-bar {
  height: 4px;
  background: var(--white-opacity-5);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.mtp-model-bar-fill {
  height: 100%;
  background: var(--tsukuyomi-300-opacity-70); /* token: tsukuyomi-300 @ 70% */
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-model-meta {
  display: flex;
  gap: 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
}

.mtp-totals {
  margin: 0 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mtp-total {
  padding: 12px 14px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
  border-radius: 10px;
}

.mtp-total-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.mtp-total-label {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.mtp-total-icon {
  color: var(--accent-opacity-85); /* token: accent-silver @ 85% */
  font-size: 11px;
  opacity: 0.7;
}

.mtp-total-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.02em;
}

/* Reuse desktop TaskTodos / TaskStream inside the mobile layout */
.mtp-todos-wrap {
  margin: 0 16px 10px;
  border: 1px solid var(--white-opacity-10);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
}

/* 待办 tab：占满可用空间 */
.mtp-todo-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mtp-todos-wrap--full {
  flex: 1;
  min-height: 0;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
}

.mtp-todos-wrap--full :deep(.todos-section) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mtp-todos-wrap--full :deep(.todos-list),
.mtp-todos-wrap--full :deep(.todo-list) {
  flex: 1;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}

.mtp-stream-wrap {
  margin: 0 16px 14px;
  border: 1px solid var(--white-opacity-10);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  min-height: 240px;
}

.mtp-stream-wrap--compact {
  min-height: 160px;
  max-height: 220px;
}

/* 日志 tab：占满可用空间，内部滚动 */
.mtp-log-stack {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.mtp-stream-wrap--fill {
  flex: 1;
  min-height: 320px;
  max-height: none;
}

/* TaskStream's .stream-section is flex column with flex:1 — fill the wrapper */
.mtp-stream-wrap :deep(.stream-section) {
  flex: 1;
  min-height: 0;
  background: transparent;
}

/* 实时 tab 活动记录：只保留输出内容，隐藏工具栏 + 思考过程 */
.mtp-stream-wrap--compact :deep(.stream-header),
.mtp-stream-wrap--compact :deep(.thinking-block),
.mtp-stream-wrap--compact :deep(.completed-banner) {
  display: none;
}

.mtp-stream-wrap--compact :deep(.output-block) {
  margin: 0;
  border: none;
  background: transparent;
}
</style>
