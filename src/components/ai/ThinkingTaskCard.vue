<script setup lang="ts">
/**
 * AI 思考过程面板里的「进行中 / 刚结束的任务」卡片。从 ThinkingProcessBody 拆出，
 * 把状态图标 :class 对象、各类 v-if 收进子组件，降低父模板圈复杂度。
 */
import Button from 'primevue/button';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { TASK_TYPE_LABELS } from 'src/constants/ai';
import { formatTaskDuration } from 'src/utils';

interface Props {
  task: AIProcessingTask;
  nowMs: number;
  onOpenDetail: (task: AIProcessingTask) => void;
  onStopTask: (taskId: string) => void;
  setThinkingMessageRef: (taskId: string, el: HTMLElement | null) => void;
}

const props = defineProps<Props>();

const statusLabels: Record<string, string> = {
  thinking: '思考中',
  processing: '处理中',
  end: '已完成',
  error: '错误',
  cancelled: '已取消',
};

// 状态 → 图标 class 查表，替代原先模板里的 4 路 :class 对象
const STATUS_ICON: Record<string, string> = {
  thinking: 'pi-spin pi-spinner text-primary',
  processing: 'pi-spin pi-spinner text-primary',
  end: 'pi-check-circle text-green-500',
  error: 'pi-times-circle text-red-500',
  cancelled: 'pi-ban text-orange-500',
};

const statusIcon = (status: string): string => STATUS_ICON[status] ?? '';
const statusLabel = (status: string): string => statusLabels[status] ?? status;
const typeLabel = (type: AIProcessingTask['type']): string => TASK_TYPE_LABELS[type] || type;
const formatDuration = (startTime: number, endTime?: number): string =>
  formatTaskDuration(startTime, endTime, props.nowMs);

const hasThinking = (t: AIProcessingTask): boolean => !!t.thinkingMessage && t.thinkingMessage.trim() !== '';
const isRunning = (t: AIProcessingTask): boolean => t.status === 'thinking' || t.status === 'processing';
</script>

<template>
  <div class="thinking-task-card p-4 rounded-lg border border-white/10 bg-white/5">
    <div class="thinking-task-head flex items-start justify-between mb-2 gap-2">
      <div class="thinking-task-main flex items-center gap-2 flex-1 min-w-0">
        <i class="pi flex-shrink-0" :class="statusIcon(task.status)" />
        <span class="thinking-model-name font-medium text-moon/90 truncate">{{
          task.modelName
        }}</span>
        <span class="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary flex-shrink-0">{{
          typeLabel(task.type)
        }}</span>
      </div>
      <div class="thinking-task-status flex items-center gap-2 flex-shrink-0">
        <span class="text-xs text-moon/60">{{ statusLabel(task.status) }}</span>
        <Button
          v-if="hasThinking(task)"
          icon="pi pi-external-link"
          class="p-button-text p-button-sm p-button-rounded"
          :pt="{ root: { class: '!p-1 !min-w-0 !h-6 !w-6' } }"
          title="查看完整思考过程"
          aria-label="查看完整思考过程"
          @click="onOpenDetail(task)"
        />
        <Button
          v-if="isRunning(task)"
          icon="pi pi-stop"
          class="p-button-text p-button-sm p-button-rounded p-button-danger"
          :pt="{ root: { class: '!p-1 !min-w-0 !h-6 !w-6' } }"
          aria-label="停止任务"
          @click="onStopTask(task.id)"
        />
      </div>
    </div>

    <p v-if="task.message" class="text-sm text-moon/70 mt-2 break-words">
      {{ task.message }}
    </p>

    <div v-if="hasThinking(task)" class="mt-2 p-2 rounded bg-white/3 border border-white/5">
      <p class="text-xs text-moon/50 mb-1">思考过程：</p>
      <p
        :ref="(el) => setThinkingMessageRef(task.id, el as HTMLElement)"
        class="text-xs text-moon/70 whitespace-pre-wrap break-words max-h-32 overflow-y-auto"
        style="word-break: break-all; overflow-wrap: anywhere"
      >
        {{ task.thinkingMessage }}
      </p>
    </div>

    <div
      class="thinking-task-meta flex items-center gap-2 mt-3 text-xs text-moon/50 break-words"
    >
      <span>运行时间: {{ formatDuration(task.startTime, task.endTime) }}</span>
      <span v-if="task.endTime" class="break-words">
        · 完成于 {{ new Date(task.endTime).toLocaleTimeString('zh-CN') }}
      </span>
    </div>
  </div>
</template>
