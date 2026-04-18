<script setup lang="ts">
import { ref } from 'vue';
import { useTranslationProgressPanel } from 'src/composables/translation-progress/useTranslationProgressPanel';
import TaskTodos from './translation-progress/TaskTodos.vue';
import TaskStream from './translation-progress/TaskStream.vue';
import TaskEmptyState from './translation-progress/TaskEmptyState.vue';

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
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'live' }"
            @click="mobileTab = 'live'"
          >
            实时
          </button>
          <button
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'todo' }"
            @click="mobileTab = 'todo'"
          >
            待办<span v-if="currentTaskTodos.length > 0" class="mtp-seg-count">
              {{ currentTaskTodos.length }}</span
            >
          </button>
          <button
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'stats' }"
            @click="mobileTab = 'stats'"
          >
            统计
          </button>
          <button
            class="mtp-seg-btn"
            :class="{ 'mtp-seg-btn-active': mobileTab === 'log' }"
            @click="mobileTab = 'log'"
          >
            日志
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="mtp-body">
        <!-- 实时 -->
        <template v-if="mobileTab === 'live'">
          <div class="mtp-live-card">
            <div class="mtp-live-head">
              <i
                class="pi mtp-live-spinner"
                :class="mobileIsRunning ? 'pi-spin pi-spinner' : 'pi-check-circle'"
                aria-hidden="true"
              />
              <span class="mtp-live-eyebrow">
                {{ mobileIsRunning ? '正在翻译' : '已停止' }} · §
                {{ String(mobileProgress.current).padStart(3, '0') }}
              </span>
              <span class="mtp-live-model">
                <i class="pi pi-sparkles" aria-hidden="true" />
                {{ currentTask.modelName }}
              </span>
            </div>
            <div v-if="currentTask.progress?.message" class="mtp-live-text">
              {{ currentTask.progress.message }}
            </div>
            <div v-else-if="currentTask.thinkingMessage" class="mtp-live-text">
              {{ currentTask.thinkingMessage.split('\n').slice(-1)[0] }}
            </div>
            <div class="mtp-live-bar">
              <div class="mtp-live-bar-fill" :style="{ width: `${mobileProgress.percent}%` }" />
            </div>
            <div class="mtp-live-meta">
              <span>
                上下文
                <template v-if="currentTask.contextPercentage !== undefined">
                  {{ currentTask.contextPercentage }}%
                </template>
                <template v-else>—</template>
              </span>
              <span>{{ formatDuration(currentTask.startTime, currentTask.endTime) }}</span>
            </div>
          </div>

          <div class="mtp-section-label">活动记录</div>
          <div class="mtp-stream-wrap mtp-stream-wrap--compact">
            <TaskStream
              :task="currentTask"
              :parts="currentParts"
              :auto-scroll="currentAutoScroll"
              @toggle-auto-scroll="toggleAutoScroll"
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
              <TaskTodos
                :todos="currentTaskTodos"
                :collapsed="false"
                @toggle-collapsed="toggleTodoCollapsed"
              />
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
                @toggle-auto-scroll="toggleAutoScroll"
              />
            </div>
          </div>
        </template>
      </div>

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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.mtp-head-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(109, 136, 168, 0.18);
  border: 1px solid rgba(109, 136, 168, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.mtp-head-icon i {
  color: #a3b7cf;
  font-size: 14px;
}

.mtp-head-text {
  flex: 1;
  min-width: 0;
}

.mtp-head-title {
  font-size: 14px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.mtp-head-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
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
  color: rgba(247, 244, 236, 0.75);
  background: transparent;
  border: none;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-head-close:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(247, 244, 236, 1);
}

.mtp-head-close i {
  font-size: 12px;
}

/* Hero meter */
.mtp-hero {
  padding: 16px 20px 12px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
  line-height: 1;
}

.mtp-hero-den {
  color: rgba(247, 244, 236, 0.55);
  font-weight: 400;
}

.mtp-hero-label {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
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
  color: #a3b7cf;
  font-weight: 500;
}

.mtp-bar {
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.mtp-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #6d88a8, #d8dde8);
  border-radius: 3px;
  box-shadow: 0 0 12px rgba(109, 136, 168, 0.5);
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-bar-shimmer {
  position: absolute;
  top: 0;
  width: 2px;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  transition: left 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-legend {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  color: rgba(247, 244, 236, 0.7);
  border-radius: 7px;
  cursor: pointer;
  border: none;
  background: transparent;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-seg-btn-active {
  background: rgba(109, 136, 168, 0.2);
  color: #e9edf5;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.mtp-seg-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  opacity: 0.7;
}

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
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 500;
}

.mtp-empty {
  padding: 28px 20px;
  text-align: center;
  color: rgba(247, 244, 236, 0.45);
  font-size: 12px;
}

/* Live card */
.mtp-live-card {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: rgba(109, 136, 168, 0.1);
  border: 1px solid rgba(109, 136, 168, 0.3);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(109, 136, 168, 0.25);
}

.mtp-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mtp-live-spinner {
  color: #a3b7cf;
  font-size: 12px;
}

.mtp-live-eyebrow {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #a3b7cf;
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
  background: rgba(109, 136, 168, 0.15);
  color: #bac9db;
  border: 1px solid rgba(109, 136, 168, 0.3);
}

.mtp-live-model i {
  font-size: 9px;
}

.mtp-live-text {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 12px;
  color: rgba(247, 244, 236, 0.85);
  line-height: 1.65;
  margin-bottom: 10px;
  white-space: pre-wrap;
  word-wrap: break-word;
  max-height: 72px;
  overflow: hidden;
}

.mtp-live-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
}

.mtp-live-bar-fill {
  height: 100%;
  background: #a3b7cf;
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-live-meta {
  display: flex;
  justify-content: space-between;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 6px;
}

/* Stats */
.mtp-model-card {
  margin: 0 16px 12px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  background: #a3b7cf;
  flex-shrink: 0;
}

.mtp-model-name {
  font-size: 13px;
  color: rgba(247, 244, 236, 1);
  font-weight: 500;
}

.mtp-model-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  margin-left: auto;
}

.mtp-model-bar {
  height: 4px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.mtp-model-bar-fill {
  height: 100%;
  background: rgba(163, 183, 207, 0.7);
  transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mtp-model-meta {
  display: flex;
  gap: 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
}

.mtp-totals {
  margin: 0 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mtp-total {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.mtp-total-icon {
  color: rgba(174, 183, 198, 0.85);
  font-size: 11px;
  opacity: 0.7;
}

.mtp-total-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
}

/* Reuse desktop TaskTodos / TaskStream inside the mobile layout */
.mtp-todos-wrap {
  margin: 0 16px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
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
  border: 1px solid rgba(255, 255, 255, 0.1);
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

/* Bottom actions */
.mtp-actions {
  padding: 10px 12px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.72);
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
  background: rgba(255, 255, 255, 0.03);
  color: rgba(247, 244, 236, 0.85);
  border-color: rgba(255, 255, 255, 0.1);
}

.mtp-btn-outline:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.mtp-btn-danger {
  color: #ef5f5f;
  border-color: rgba(239, 95, 95, 0.3);
}
</style>
