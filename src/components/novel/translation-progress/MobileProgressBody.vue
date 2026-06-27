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
